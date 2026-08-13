// Market Intent 每日快照 cron(2.2.2)。盘后跑:资金数据就绪日(latestFundYmd)为准,
// 周末/假日自然落到"最新已存日=已就绪日"→ 幂等早退,不需要独立休市闸门。
// 有界回补:近 20 个交易日内缺的快照按日补(每次最多 BACKFILL_CAP 天,防超时;多跑几班收敛)。
// 回补按【时间升序】算——趋势字段(3/5日/分位/连续天数)依赖前序快照,顺序不能乱。
import { NextRequest, NextResponse } from "next/server";
import { isCronAuthorized } from "@/lib/api-guard";
import { alertCron } from "@/lib/monitor";
import { todayISO } from "@/lib/date";
import { latestFundYmd, prevAshareTradingDay } from "@/lib/tushare";
import { buildSegmentDayMetrics } from "@/lib/market-intent/metrics";
import { classifyIntent } from "@/lib/market-intent/rules";
import { saveSnapshots, storedYmdSet, loadHistory } from "@/lib/market-intent/store";
import type { SegmentIntentSnapshot } from "@/lib/market-intent/types";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const LOOKBACK_DAYS = 20; // 交易日窗口:20 日分位/位置字段的最大需求
const BACKFILL_CAP = 5; // 单次最多补几天(hnd1→Tushare 路径偶发劣化,保守防超时)

const ymdToISO = (ymd: string) => `${ymd.slice(0, 4)}-${ymd.slice(4, 6)}-${ymd.slice(6, 8)}`;

export async function GET(req: NextRequest) {
  if (!isCronAuthorized(req)) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }
  // 资金数据就绪日:今天收盘后 moneyflow 已出 → 今天;否则上一交易日。
  const headYmd = await latestFundYmd(todayISO()).catch(() => null);
  if (!headYmd) {
    await alertCron("market-intent", "⚠️ Market Intent:无法确定资金数据就绪日(Tushare 日历/资金表均不可用),本班跳过").catch(() => null);
    return NextResponse.json({ ok: false, error: "no_fund_ymd" }, { status: 200 });
  }

  // 窗口内交易日序列(升序):从就绪日往回走 LOOKBACK_DAYS 个交易日。
  const days: string[] = [headYmd];
  let cur = ymdToISO(headYmd);
  for (let i = 0; i < LOOKBACK_DAYS - 1; i++) {
    const prev = await prevAshareTradingDay(cur).catch(() => null);
    if (!prev) break;
    days.unshift(prev.replace(/-/g, ""));
    cur = prev;
  }

  const stored = await storedYmdSet(days[0]).catch(() => new Set<string>());
  const missing = days.filter((d) => !stored.has(d));
  if (missing.length === 0) {
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
