import { NextRequest, NextResponse } from "next/server";
import { listBriefing } from "@/lib/briefings";
import { todayISO } from "@/lib/date";
import { ashareDayStatus } from "@/lib/tushare";
import { isCronAuthorized } from "@/lib/api-guard";
import { alertCron } from "@/lib/monitor";
import { sendFeishu } from "@/lib/feishu";
import {
  getBriefStatusChecked,
  briefAlertSeverity,
  BRIEF_STATUS_UI,
  feishuPendingNoticeText,
} from "@/lib/brief-status";
import { getPrisma } from "@/lib/prisma";
import { CHAINS } from "@/data/chains";
import { isPipelinePaused } from "@/lib/insight-pipeline/docs";

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
  // 情境追问消息 30 天留存(review P1:隐私与删除设计——原问题不无限期落库)。
  // 口径与 /privacy「情境式追问」节一致:改这里必须同步隐私政策文案。
  await db.chatMessage
    .deleteMany({ where: { createdAt: { lt: new Date(Date.now() - 30 * day) } } })
    .catch(() => {});
  await db.morningBriefCache
    .deleteMany({
      where: {
        updatedAt: { lt: new Date(Date.now() - 14 * day) },
        // NOT [A,B,…] = 排除命中任一控制键前缀的行,别把持久状态位当缓存扫掉(CR-2/C-4)
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
  // quotes_cache 14 天 TTL:该表已被当通用 KV,其中「按 code×日」的行情衍生缓存
  // (fin/risk/fund/sim/lk/fundflow/apct)只会以"今天"的 key 被读,旧日期行永不再命中,
  // 此前无任何清理路径 ≈ 每交易日净增 600+ 行(2026-07-30 review)。
  // 用【白名单前缀】而非"排除法":这张表还混着常量键(latest/etf/chain-sentiment-v1/
  // llm-provider 开关/ashare-cal-window)和按日归档键(brief-status:/holiday-bridge:,
  // /daily 归档页要读历史),排除法漏登记一个新键就是数据事故;白名单漏登记只是少清。
  // 新增「按日可再生」key 家族时往这里加前缀。webpush-done: 只在当天读,一并清。
  const SWEEP_PREFIXES = ["fin:", "risk:", "fund:", "sim:", "lk:", "fundflow:", "apct:", "webpush-done:"];
  await db.quotesCache
    .deleteMany({
      where: {
        updatedAt: { lt: new Date(Date.now() - 14 * day) },
        OR: SWEEP_PREFIXES.map((p) => ({ id: { startsWith: p } })),
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
  // 二轮 review N3:isAshareTradingDay 是 fail-open(unknown→true)——工作日 A 股节假日 +
  // Tushare 故障会被当交易日处理,status=null 直接假 ❌"请手动补"。改用 ashareDayStatus 三态:
  // closed 照旧跳过;unknown 继续核对但把 tradingDayUnknown 传进分级(降 notice,不喊补发)。
  const dayStatus = await ashareDayStatus(date).catch(() => "unknown" as const);
  if (dayStatus === "closed") {
    return NextResponse.json({ ok: true, skipped: "non-trading-day", date });
  }
  const tradingDayUnknown = dayStatus === "unknown";
  // 先取当日已发布简报——既是下面简报看门狗的输入,也是 insight 心跳的前置门(P2)。
  const items = await listBriefing({ date, status: "published" }).catch(() => []);
  // insight 管线心跳(PRD §5):交易日到 08:30 还没有当日链级每日推理(draft 或 published)→ 告警。
  // 人审未完成不算失败(降级发布=地板在线);完全没草稿才是管线断了。
  // B2-4:【按链】分别核对——不能只按跨链总数判活(只要 ai 出草稿就判正常,电力链单独断产永不告警)。
  // 区分「暂停待恢复」(预期,轻提醒)与「疑似断产」(点名 ❌ 告警)。
  // P2:仅在【当日已有已发布简报】时判 insight 问题——简报本身没产出时 insight 无输入是必然,
  //     那是简报断产(下面简报看门狗会报),不是 insight 管线断产,别重复/错误归因告警。
  try {
    const dbi = getPrisma();
    if (dbi && items.length > 0) {
      for (const chain of Object.values(CHAINS).filter((c) => c.segments?.length)) {
        const cnt = await dbi.insightDoc
          .count({ where: { date, chainId: chain.id, kind: "daily", status: { in: ["draft", "published"] } } })
          .catch(() => -1);
        if (cnt !== 0) continue;
        const paused = await isPipelinePaused(chain.id).catch(() => null);
        if (paused) {
          await alertCron(
            "insight-daily 看门狗",
            `交易日 ${date} ${chain.name} 管线暂停中(${paused}),无当日草稿属预期;确认后 POST /api/admin/insight-daily?force=1&chain=${chain.id} 恢复`
          );
        } else {
          await sendFeishu(
            `❌ StockTell ${chain.name}·链级每日推理缺失 · ${date} · 08:30 仍无 draft(07:05 主跑+07:40 补跑都没产出)。手动:POST /api/admin/insight-daily?force=1&chain=${chain.id}(Bearer ADMIN_TOKEN)`
          );
          await alertCron("insight-daily 看门狗", `交易日 ${date} ${chain.name} 无当日每日推理草稿,管线疑似断产`);
        }
      }
    }
  } catch {
    /* insight 心跳失败不影响简报看门狗主流程 */
  }
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
    const { emailDigestPaused } = await import("@/lib/digest");
    if (digestSent === 0 && emailDigestPaused()) {
      payload = { ok: true, date, count: items.length, digestPaused: true };
    } else if (digestSent === 0) {
      const fs = await sendFeishu(
        `❌ StockTell 简报在但邮件疑似没发 · ${date} · 简报 ${items.length} 条,当日发送记录 0 条(推送段可能被截断)。请补推:POST /api/admin/push-digest(Bearer ADMIN_TOKEN,默认只补没发的)`
      );
      await alertCron("简报看门狗", `交易日 ${date} 简报已发布但当日发送记录为 0,盘前邮件疑似未发,需手动补推`);
      payload = { ok: true, date, count: items.length, digestSuspect: true, feishu: fs };
    } else {
      // 成功:推一条确认(主/补位 cron 正常跑通)。模板兜底(fallback)也算"在"——
      // 但要在确认里带出来:低置信内容在线上,提醒人工过稿,别当成全真产出放心睡。
      const { rec: brief } = await getBriefStatusChecked(date);
      const fallbackNote =
        brief?.status === "fallback"
          ? " ⚠️ 本期为模板兜底(低置信),请到 /admin/briefing 人工过一遍"
          : "";
      const fs = await sendFeishu(
        `✅ StockTell 今日简报已就绪 · ${date} · 共 ${items.length} 条,已发早报 ${digestSent < 0 ? "?" : digestSent} 人(主/补位 cron 正常)${fallbackNote}`
      );
      payload = { ok: true, date, count: items.length, digestSent, briefStatus: brief?.status, feishu: fs };
    }
  } else {
    // 0 简报 ≠ 一律事故(2.1-B):先读 brief-status 分级,别把"设计性无简报"误报成 ❌ 并给出
    // 误导性"需补发"指令(休市不硬造=不变量#7;2026-07-06 休市交易日误报实录)。
    // review F2/F5 修订:带上下文分级——状态说"已生成"但 0 条=不一致态照样 ❌;读失败≠无状态。
    const { rec: brief, readFailed } = await getBriefStatusChecked(date);
    const severity = briefAlertSeverity(brief, {
      publishedCount: 0,
      statusReadFailed: readFailed,
      tradingDayUnknown,
      beforeBackup: false, // 08:30 跑,补位已尘埃落定
    });
    if (severity === "none") {
      // 休市等设计性缺口:中性心跳(看门狗职责=每早可感知,静默会和"看门狗自己挂了"混淆),
      // 不告警、不给补发指令。有 holiday_bridge 时带出来,人知道用户侧不是空页。
      const ui = BRIEF_STATUS_UI[brief!.status];
      const bridgeNote =
        brief!.subType === "holiday_bridge"
          ? `已发布「节后首日观察」(素材=${brief!.fallbackFromDate ?? "最近有效交易日"});`
          : "";
      const fs = await sendFeishu(
        `🛌 StockTell 今日无新简报(${ui.badge}) · ${date} · ${ui.note}${bridgeNote}设计性无简报,勿补发`
      );
      payload = { ok: true, date, count: 0, briefStatus: brief!.status, feishu: fs };
    } else if (severity === "notice") {
      // 合规阻断待审 / 状态读失败 / 交易日未知:低优先级提示(非 🚨 非 ❌),不喊补发。
      const fs = await sendFeishu(
        brief && !readFailed
          ? feishuPendingNoticeText(brief, date)
          : readFailed
            ? `⚠️ StockTell 简报状态读取失败 · ${date} · 0 条已发布但状态读不到(DB 抖动),请人工看一眼 /admin/briefing`
            : `⚠️ StockTell 今日无简报且交易日未知 · ${date} · Tushare 日历不可用,可能为 A 股假日(生成 cron 在闸门跳过属预期);若确认是交易日再手动补`
      );
      payload = { ok: true, date, count: 0, briefStatus: brief?.status ?? null, notice: true, feishu: fs };
    } else {
      // failed(补位也没救回)/ 状态缺失(生成 cron 疑似没跑)/ 状态与库矛盾(说已生成却 0 条):
      // 事故,告警让人工补。08:30 补位已尘埃落定,此时手动补发指令是恰当的。
      const detail = !brief
        ? ";且无状态记录,疑似生成 cron 未跑"
        : brief.status === "failed"
          ? `;状态=failed(主跑+补位都失败)`
          : `;状态=${brief.status} 但库里 0 条(状态与库矛盾:疑似发布后被清空/写入中断)`;
      const fs = await sendFeishu(
        `❌ StockTell 今日简报缺失 · ${date} · 到 08:30 仍 0 条(主 07:00 + 补位 07:40 都没出${detail})。请手动补:POST /api/briefing/generate?replace=1&llm=1(Bearer ADMIN_TOKEN)`
      );
      await alertCron("简报看门狗", `交易日 ${date} 到 08:30 仍无已发布简报${detail},需手动补`);
      payload = { ok: true, date, alerted: true, count: 0, briefStatus: brief?.status ?? null, feishu: fs };
    }
  }
  // await 而非 fire-and-forget:serverless 返回后悬空 promise 可能随实例冻结丢失
  await sweepCaches();
  return NextResponse.json(payload);
}
