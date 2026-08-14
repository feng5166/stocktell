// Market Intent 每日快照 cron(2.2.2)。盘后跑:资金数据就绪日(latestFundYmd)为准,
// 周末/假日自然落到"最新已存日=已就绪日"→ 幂等早退,不需要独立休市闸门。
// 有界回补:近 20 个交易日内缺的快照按日补(每次最多 BACKFILL_CAP 天,防超时;多跑几班收敛)。
// 回补按【时间升序】算——趋势字段(3/5日/分位/连续天数)依赖前序快照,顺序不能乱。
import { NextRequest, NextResponse } from "next/server";
import { isCronAuthorized } from "@/lib/api-guard";
import { alertCron } from "@/lib/monitor";
import { todayISO } from "@/lib/date";
import { latestFundYmd, ashareTradingDaysWindow } from "@/lib/tushare";
import { buildSegmentDayMetrics } from "@/lib/market-intent/metrics";
import { classifyIntent } from "@/lib/market-intent/rules";
import { saveSnapshots, storedYmdSet, loadHistory } from "@/lib/market-intent/store";
import { buildDailyJudgments, saveDailyJudgments } from "@/lib/judgment";
import type { SegmentIntentSnapshot } from "@/lib/market-intent/types";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const LOOKBACK_DAYS = 20; // 交易日窗口:20 日分位/位置字段的最大需求
const BACKFILL_CAP = 5; // 单次最多补几天(hnd1→Tushare 路径偶发劣化,保守防超时)

// Daily Judgment 存档(2.2.5):合成失败不影响快照主流程,只发告警
async function persistJudgments(): Promise<void> {
  try {
    const res = await buildDailyJudgments();
    if (res) await saveDailyJudgments(res.ymd, res.judgments);
  } catch (e) {
    await alertCron(
      "market-intent",
      `⚠️ Daily Judgment 存档失败(快照不受影响)\n${e instanceof Error ? e.message : String(e)}`
    ).catch(() => null);
  }
}

export async function GET(req: NextRequest) {
  if (!isCronAuthorized(req)) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }
  // 资金数据就绪日:今天收盘后 moneyflow 已出 → 今天;否则上一交易日。
  // Tushare 探测限时 20s:hnd1→Tushare 中国白天时段劣化(2026-08-14 盘中实测连续
  // FUNCTION_INVOCATION_TIMEOUT,夜间同路径秒过)——探测超时不值得吃掉整个函数预算,
  // 退化为纯 DB 模式:以最新已存快照日为 head,跳过回补只刷 Judgment,快速返回。
  const headProbe = await Promise.race([
    latestFundYmd(todayISO()).catch(() => null),
    new Promise<null>((r) => setTimeout(() => r(null), 20000)),
  ]);
  let headYmd = headProbe;
  let degraded = false;
  if (!headYmd) {
    const latest = await (await import("@/lib/market-intent/store")).latestSnapshots().catch(() => null);
    if (!latest) {
      await alertCron("market-intent", "⚠️ Market Intent:Tushare 不可达且库内无历史快照,本班跳过").catch(() => null);
      return NextResponse.json({ ok: false, error: "no_fund_ymd" }, { status: 200 });
    }
    headYmd = latest.ymd;
    degraded = true;
  }
  if (degraded) {
    await persistJudgments();
    return NextResponse.json({ ok: true, degraded: true, head: headYmd, note: "tushare 慢路径,已退化纯 DB 刷 Judgment;快照回补交给下一班" });
  }

  // 窗口内交易日序列(升序):一次 trade_cal 取整窗(逐日 prev 串行组窗会超时,2026-08-13 实测)。
  const days = await ashareTradingDaysWindow(headYmd, LOOKBACK_DAYS);

  const stored = await storedYmdSet(days[0]).catch(() => new Set<string>());
  // force=1:只重算最新一天(规则调优后刷新当日判定用;不重写更早历史——Track 要看「当时判断了什么」)
  if (req.nextUrl.searchParams.get("force") === "1") stored.delete(headYmd);
  const missing = days.filter((d) => !stored.has(d));
  if (missing.length === 0) {
    await persistJudgments(); // 快照已齐也刷 Judgment(规则更新后重跑即生效,4 行 upsert 幂等)
    return NextResponse.json({ ok: true, upToDate: true, head: headYmd });
  }
  // 首次冷启动:窗口全缺 → 只从能补的头部开始(升序前 BACKFILL_CAP 天),
  // 趋势字段在历史攒够前为 null,规则引擎自会降级,不硬造。
  const todo = missing.slice(0, BACKFILL_CAP);

  const history = await loadHistory(todo[0]).catch(() => new Map());
  const done: string[] = [];
  const failed: string[] = [];
  for (const ymd of todo) {
    try {
      const metricsList = await buildSegmentDayMetrics(ymd, history);
      const snaps: SegmentIntentSnapshot[] = metricsList.map((m) => ({
        ymd,
        segment: m.segment,
        metrics: m,
        intent: classifyIntent(m),
      }));
      await saveSnapshots(snaps);
      // 本轮后续日期的历史输入:内存追加,不回读 DB
      for (const m of metricsList) {
        const arr = history.get(m.segment) ?? [];
        arr.push(m);
        history.set(m.segment, arr);
      }
      done.push(ymd);
    } catch (e) {
      failed.push(ymd);
      // 中间某天失败必须停:继续算后面的日子会让趋势字段建立在缺口上
      await alertCron(
        "market-intent",
        `⚠️ Market Intent 快照失败 ymd=${ymd}(后续日期本班不再计算,防趋势缺口)\n${e instanceof Error ? e.message : String(e)}`
      ).catch(() => null);
      break;
    }
  }

  if (done.includes(headYmd)) await persistJudgments(); // 最新日快照落定后合成并存档链级 Judgment

  const remaining = missing.length - done.length - failed.length;
  if (done.length > 0 && (remaining > 0 || done.length > 1)) {
    // 回补发生时给一条 notice(与 outcome 自愈同风格),日常单日跑不打扰
    await alertCron(
      "market-intent 回补",
      `✅ Market Intent 已补 ${done.length} 个交易日(${done[0]}~${done[done.length - 1]}),窗口内仍缺 ${remaining} 天,下班次继续`
    ).catch(() => null);
  }
  return NextResponse.json({ ok: failed.length === 0, done, failed, remaining });
}
