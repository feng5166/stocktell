import { NextRequest, NextResponse } from "next/server";
import { generateDrafts } from "@/lib/generate";
import { insertDrafts, listBriefing } from "@/lib/briefings";
import { generateChainTake } from "@/lib/chain-take";
import { runPreOpenDigest } from "@/lib/digest";
import { runWebPush } from "@/lib/push-web";
import { todayISO } from "@/lib/date";
import { isCronAuthorized } from "@/lib/api-guard";
import { alertCron } from "@/lib/monitor";
import { sendFeishu } from "@/lib/feishu";
import { setBriefStatus } from "@/lib/brief-status";
import { getPrisma } from "@/lib/prisma";
import { tradingDayGate } from "@/lib/trading-gate";

export const dynamic = "force-dynamic";
// 生成(LLM 几十秒)+ 逐用户早报(每人 LLM+Tushare+节流)同函数串行,60s 必被 Vercel 硬杀,
// 邮件/推送在生成之后 → 简报在、推送无声丢(2026-07-03 事故)。Pro 上限给足。
export const maxDuration = 300;

export async function GET(req: NextRequest) {
  // 鉴权:Vercel cron 会带 Authorization: Bearer ${CRON_SECRET}
  if (!isCronAuthorized(req)) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  // 只在 A 股交易日生成。fail-closed:Tushare 不可用无法确认交易日时不生成(假日误发不可撤回),
  // 但 unknown 必须告警——否则真交易日的 Tushare 抖动会被静默跳过。unknown 告警当天全局去重。
  const date = todayISO();
  const gate = await tradingDayGate(date, "briefing(简报生成)", {
    onUnknown: "skip",
    recoveryHint:
      "①发布 POST /api/briefing/generate?replace=1&llm=1 ②补推 GET /api/cron/briefing(会补 digest/webpush)",
  });
  if (gate) return NextResponse.json({ ok: true, ...gate });

  try {
    // 幂等看「已发布」而非「任何状态」:管理员预览产生的 draft 不该让主/补位 cron 全天跳过。
    const published = await listBriefing({ date, status: "published" });
    if (published.length > 0) {
      // 简报已在,但推送段可能被上一跑的超时截断没发出去(2026-07-03 事故)→ 补跑推送段。
      // 这里天然幂等、无需"跳过"分支:digest 按用户幂等(send_log,已发的跳过),webpush 由
      // maybeWebPush 用自己的当日广播标记去重,链级判断 generateChainTake 已有缓存则秒回。
      // 主跑已成功时,这里 = 一次廉价 no-op;主跑发布后被截断时,这里把三样都补齐。
      const chainTake = await generateChainTake("ai", date, published).catch(
        async (e) => {
          await alertCron("briefing(链级判断·补位)", e);
          return null;
        }
      );
      const digest = await runDigest(date, "补位");
      const webpush = await maybeWebPush(date, "补位");
      return NextResponse.json({
        ok: true,
        recovered: true,
        date,
        count: published.length,
        chainTake: chainTake ? !!chainTake.take : false,
        digest: digestSummary(digest),
        webpush,
      });
    }

    const { drafts, engine, usMarketClosed } = await generateDrafts();
    // 美股休市(节假日):不硬拿旧数据生成隔夜映射,明说跳过。
    // 但交易日早上判到"美股休市"多半是行情源抖动导致 asOf 陈旧的误判 → 告警(别静默),
    // 真节假日时这条告警当 FYI,但一年没几次,值得人眼扫一下确认。
    if (usMarketClosed) {
      // 状态标识(2.0 收尾):休市缺口=正确保护,标 market_closed(非 failed),前台据此提示不误判成漏跑。
      await setBriefStatus(date, {
        status: "market_closed",
        reason: "us_market_closed",
        message: "美股休市,今日无新的隔夜美股映射。",
      });
      await alertCron(
        "briefing(简报生成)",
        `交易日 ${date} 判定"美股休市"跳过 —— 若非美股真节假日,多半是 07:00 美股行情源抖动致 asOf 陈旧的误判,需手动重发(/api/admin… 或 generate?replace=1)`
      );
      // 没有隔夜简报,但用户持仓的资金面/雷区提醒(digest 的 alerts-only 分支)不依赖美股,
      // 照常发——否则美股源抖动的早上,这批高信号提醒被连带静默跳过(评审确认)。
      const digest = await runDigest(date, "");
      return NextResponse.json({
        ok: true,
        date,
        skipped: "us-market-closed",
        digest: digestSummary(digest),
      });
    }
    // 方案 B:生成后直接发布上线
    const created = await insertDrafts(
      drafts.map((d) => ({ ...d, status: "published" as const }))
    );
    // 交易日却 0 条发布:movers 为空(美股行情抓取失败/陈旧)等静默失败 → 告警,别让它无声过去。
    // (此前 2026-06-29 早盘正是走到这类静默 0 条,导致整天没简报/没推送/查账缺一天。)
    if (created.length === 0) {
      await alertCron(
        "briefing(简报生成)",
        `交易日 ${date} 生成 0 条简报(movers 为空,疑似美股行情抓取失败/陈旧)—— 需手动重发`
      );
    }
    // 状态标识:交易日且非休市——LLM 产出=generated,模板兜底=fallback(低置信/进人工审,
    // 【不是】失败),0 条=failed(与休市缺口区分开)。
    await setBriefStatus(
      date,
      created.length > 0
        ? engine === "llm"
          ? { status: "generated" }
          : { status: "fallback", reason: "llm_failed", message: `交易日 ${date} LLM 不可用,规则模板兜底生成 ${created.length} 条,待人工审阅。` }
        : { status: "failed", reason: "data_fetch_failed", message: `交易日 ${date} 生成 0 条(movers 为空/美股行情陈旧)。` }
    );
    // 模板兜底是非事故但需人眼:发一条低优提示(非 🚨),让人知道今天内容置信度低、去 admin 过一遍。
    if (created.length > 0 && engine !== "llm") {
      await sendFeishu(
        `⚠️ StockTell 简报模板兜底 · ${date} · LLM 不可用,规则模板生成 ${created.length} 条(低置信)。请到 /admin/briefing 人工过一遍,非事故无需补发`
      ).catch(() => {});
    }
    // 链级「今日一句话判断」(链页顶部用):放在推送段之前,推送段再出事它也已生成。
    // 失败不致命(链页有规则兜底文案),但告警知晓。
    const chainTake = await generateChainTake("ai", date, created).catch(
      async (e) => {
        await alertCron("briefing(链级判断)", e);
        return null;
      }
    );
    // 盘前推送:digest 总是跑——它的 alerts-only 分支(雷区/资金面提醒)不依赖简报,
    // 0 条发布的交易日照样要给持仓有异动的用户发提醒(created>0 才跑会静默漏掉这批,评审确认)。
    const digest = await runDigest(date, "");
    // Web Push 是"今日简报"通用广播,0 条发布无内容可播 → 不广播。
    const webpush = created.length > 0 ? await maybeWebPush(date, "") : null;
    return NextResponse.json({
      ok: true,
      date,
      engine,
      published: created.length,
      chainTake: chainTake ? !!chainTake.take : false,
      digest: digestSummary(digest),
      webpush,
    });
  } catch (e) {
    // 状态标识:生成异常→failed(待人工核查),与休市缺口区分。
    await setBriefStatus(date, { status: "failed", reason: "data_fetch_failed", message: String(e).slice(0, 200) });
    await alertCron("briefing(简报生成)", e);
    return NextResponse.json({ ok: false, error: String(e) }, { status: 500 });
  }
}

// 只回计数,绝不把 runPreOpenDigest 的 results(内含每个订户 email/userId)放进响应体——
// cron 响应会进平台日志/任何抓到它的地方,等于泄露全体订户 PII。
function digestSummary(
  d: { candidates?: number; sent?: number; failed?: number; alreadySent?: number } | null
) {
  if (!d) return null;
  return {
    candidates: d.candidates ?? 0,
    sent: d.sent ?? 0,
    failed: d.failed ?? 0,
    alreadySent: d.alreadySent ?? 0,
  };
}

// 邮件 digest:按用户幂等(digest_send_log,已发的跳过),所以主跑/补位重复调用都安全。
// 抛错/部分失败都告警(tag 区分主跑 vs 补位)。
async function runDigest(date: string, tag: string) {
  const label = `briefing(盘前邮件${tag ? "·" + tag : ""})`;
  const digest = await runPreOpenDigest().catch(async (e) => {
    await alertCron(label, e);
    return null;
  });
  if (digest?.failed) {
    await alertCron(
      label,
      `${date} 邮件部分失败 ${digest.failed}/${digest.candidates},可补:POST /api/admin/push-digest`
    );
  }
  return digest;
}

// Web Push 是「全体订阅广播」,不像 digest 有 per-user 幂等——重复调用会重复弹通知。
// 用当天专属广播标记去重:只有确实广播成功(runWebPush 跑了发送循环,非 skip 非抛错)才落标记;
// 标记在 → 补位再调直接跳过(不重复骚扰);标记不在(截断/抛错/0条发布)→ 补位会补广播一次。
// 残留:极小概率「广播成功但标记写失败」→ 补位重播一次(仅一条重复通知,低危,可接受)。
type DB = NonNullable<ReturnType<typeof getPrisma>>;
async function webpushDoneToday(db: DB | null, date: string): Promise<boolean> {
  if (!db) return false;
  const row = await db.quotesCache
    .findUnique({ where: { id: `webpush-done:${date}` } })
    .catch(() => null);
  return !!row;
}
async function maybeWebPush(date: string, tag: string) {
  const db = getPrisma();
  if (await webpushDoneToday(db, date)) return { skipped: "already-broadcast" };
  const r = await runWebPush().catch(async (e) => {
    await alertCron(`briefing(网页推送${tag ? "·" + tag : ""})`, e);
    return null;
  });
  // 只在"真投递出去了"才落标记:订阅者=0(无内容可播,补也没用)或至少 1 条 sent 成功。
  // 广播循环跑了但 sent=0(推送服务瞬时全挂,sendPush 吞错返回 error 不抛)= 全军覆没,
  // 不落标记 → 07:40 补位会补广播(此前误落标记会永久压制补位重播,评审确认的回归)。
  const delivered =
    !!r && typeof r.subs === "number" && (r.subs === 0 || (r.sent ?? 0) > 0);
  if (db && delivered) {
    await db.quotesCache
      .upsert({
        where: { id: `webpush-done:${date}` },
        create: { id: `webpush-done:${date}`, data: { done: true } },
        update: { data: { done: true } },
      })
      .catch(() => {});
  }
  return r;
}
