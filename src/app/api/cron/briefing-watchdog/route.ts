import { NextRequest, NextResponse } from "next/server";
import { listBriefing } from "@/lib/briefings";
import { todayISO } from "@/lib/date";
import { isAshareTradingDay } from "@/lib/tushare";
import { isCronAuthorized } from "@/lib/api-guard";
import { alertCron } from "@/lib/monitor";
import { sendFeishu } from "@/lib/feishu";
import { getPrisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";
export const maxDuration = 60; // 心跳 + 缓存清扫(清扫在心跳之后,永远不挤占本职)

// morning_brief_cache 被复用成通用 KV,里面混着两类东西:①可再生的缓存(早报 v3/v4/v5、链级
// 判断 chaintake:)——TTL 清扫的对象;②持久控制/状态位——**绝不能被 TTL 扫掉**。目前控制位有
// insight 管线的「同图谱自动暂停」标记 insight-paused:{chain}(docs.ts),它必须人工恢复;若被
// 14 天 TTL 删掉,暂停态会静默自恢复(2026-07-03 评审 C-4;且它的 updatedAt 是 @default(now())
// 不刷新,暂停一放久必过期)。清扫一律排除这些控制键前缀。新增控制键往这里加。
const CONTROL_KEY_PREFIXES = ["insight-paused:"];

// 缓存日常清扫(放在心跳之后执行:清扫慢——比如被灌表后的首次大扫除——绝不能饿死看门狗本职)。
// - morning_brief_cache 14 天 TTL:表按(日期×组合×版本)只增不减,升版作废的旧版本行
//   (v3 污染行、v4 残留)没有别的清理路径;14 天足够覆盖复盘取证。
// - deep_analysis_cache 30 天 TTL:同样只增不减(条目深读的旧 id 行、每日个股/资金面行)。
// - 老前缀 morning:/fundflow: 立即清:曾可被客户端伪造数据污染,读路径已升版不再碰,
//   留着只是死重(startsWith "morning:" 不会误伤 "morningv2:",冒号错位)。
async function sweepCaches() {
  const db = getPrisma();
  if (!db) return;
  const day = 24 * 3600 * 1000;
  await db.morningBriefCache
    .deleteMany({
      where: {
        updatedAt: { lt: new Date(Date.now() - 14 * day) },
        // NOT [A,B,…] = 排除命中任一控制键前缀的行,别把持久状态位当缓存扫掉
        NOT: CONTROL_KEY_PREFIXES.map((p) => ({ key: { startsWith: p } })),
      },
    })
    .catch(() => {});
  // 30 天 TTL 只扫按日生成的 key 家族(morningv2/fundflowv2/stock:);条目 id 键的深读不扫——
  // 那是对历史事件的解读存档,删了会在用户翻旧简报时按"今天的行情"重新生成,时代错乱。
  await db.deepAnalysisCache
    .deleteMany({
      where: {
        OR: [
          {
            updatedAt: { lt: new Date(Date.now() - 30 * day) },
            briefingId: { startsWith: "morningv2:" },
          },
          {
            updatedAt: { lt: new Date(Date.now() - 30 * day) },
            briefingId: { startsWith: "fundflowv2:" },
          },
          {
            updatedAt: { lt: new Date(Date.now() - 30 * day) },
            briefingId: { startsWith: "stock:" },
          },
          { briefingId: { startsWith: "morning:" } },
          { briefingId: { startsWith: "fundflow:" } },
        ],
      },
    })
    .catch(() => {});
}

// 简报状态日报 / 看门狗:08:30 北京(主 07:00 + 补位 07:40 都尘埃落定后),
// 每个交易日核对当天简报,成功 ✅ / 失败 ❌ 都推飞书,把"静默漏一整天"变成"每早可感知"。
export async function GET(req: NextRequest) {
  if (!isCronAuthorized(req)) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }
  const date = todayISO();
  if (!(await isAshareTradingDay(date))) {
    return NextResponse.json({ ok: true, skipped: "non-trading-day", date });
  }
  // insight 管线心跳(PRD §5):交易日到 08:30 还没有当日链级每日推理(draft 或 published)→ 告警。
  // 人审未完成不算失败(降级发布=地板在线);完全没草稿才是管线断了。
  try {
    const dbi = getPrisma();
    const dailyCount = dbi
      ? await dbi.insightDoc.count({
          where: { date, kind: "daily", status: { in: ["draft", "published"] } },
        })
      : -1;
    if (dailyCount === 0) {
      await sendFeishu(
        `❌ StockTell 链级每日推理缺失 · ${date} · 08:30 仍无 draft(07:05 主跑+07:45 补跑都没产出)。手动:POST /api/admin/insight-daily?force=1(Bearer ADMIN_TOKEN)`
      );
      await alertCron("insight-daily 看门狗", `交易日 ${date} 无当日每日推理草稿,管线疑似断产`);
    }
  } catch {
    /* insight 心跳失败不影响简报看门狗主流程 */
  }
  const items = await listBriefing({ date, status: "published" }).catch(() => []);
  let payload: Record<string, unknown>;
  if (items.length > 0) {
    // 简报在 ≠ 邮件发了:生成和推送在同一函数里串行,推送段被超时截断时简报照常在库
    // (2026-07-03 事故)。用当天 digest_send_log(每发成功一个用户写一条)当"邮件确实发过"
    // 的证据:简报在而记录 0 条 → 推送段大概率没跑,降级为 ❌ 告警。
    // 注意:若某交易日恰好没有任何订阅者命中(candidates=0),这里会误报 ❌,宁误报不漏报。
    const db = getPrisma();
    const digestSent = db
      ? await db.digestSendLog.count({ where: { date } }).catch(() => -1)
      : -1;
    if (digestSent === 0) {
      const fs = await sendFeishu(
        `❌ StockTell 简报在但邮件疑似没发 · ${date} · 简报 ${items.length} 条,当日发送记录 0 条(推送段可能被截断)。请补推:POST /api/admin/push-digest(Bearer ADMIN_TOKEN,默认只补没发的)`
      );
      await alertCron("简报看门狗", `交易日 ${date} 简报已发布但当日发送记录为 0,盘前邮件疑似未发,需手动补推`);
      payload = { ok: true, date, count: items.length, digestSuspect: true, feishu: fs };
    } else {
      // 成功:推一条确认(主/补位 cron 正常跑通)
      const fs = await sendFeishu(
        `✅ StockTell 今日简报已就绪 · ${date} · 共 ${items.length} 条,已发早报 ${digestSent < 0 ? "?" : digestSent} 人(主/补位 cron 正常)`
      );
      payload = { ok: true, date, count: items.length, digestSent, feishu: fs };
    }
  } else {
    // 失败:主 + 补位都没产出 → 告警让人工补
    const fs = await sendFeishu(
      `❌ StockTell 今日简报缺失 · ${date} · 到 08:30 仍 0 条(主 07:00 + 补位 07:40 都没出)。请手动补:POST /api/briefing/generate?replace=1&llm=1(Bearer ADMIN_TOKEN)`
    );
    await alertCron("简报看门狗", `交易日 ${date} 到 08:30 仍无已发布简报,需手动补`);
    payload = { ok: true, date, alerted: true, count: 0, feishu: fs };
  }
  // await 而非 fire-and-forget:serverless 返回后悬空 promise 可能随实例冻结丢失
  await sweepCaches();
  return NextResponse.json(payload);
}
