// Market Intent 每日快照 cron(2.2.2)。盘后跑:资金数据就绪日(latestFundYmd)为准,
// 周末/假日自然落到"最新已存日=已就绪日"→ 幂等早退,不需要独立休市闸门。
// 有界回补:近 20 个交易日内缺的快照按日补(每次最多 BACKFILL_CAP 天,防超时;多跑几班收敛)。
// 回补按【时间升序】算——趋势字段(3/5日/分位/连续天数)依赖前序快照,顺序不能乱。
//
// 2026-08-19 修(8/18 快照整天丢失的事故):原实现把回补窗口锚在「资金就绪日 headYmd」上,
// 而 headYmd 只探测**今天**的 moneyflow;探测一失败就回退成上一交易日,窗口跟着退回去,
// 于是「缺的那天」压根不在窗口里 → missing=[] → 返回 200 upToDate,静默早退、零告警。
// 8/18 两班(17:10/21:00 CST)都这样返回,首页在 8/19 还停在 8/17 盘后,没有任何人被通知。
// 三处改动:
//  ① 窗口锚点改用**交易日历**(calAnchor=最近交易日),不再用资金就绪日;
//  ② 就绪探测只对 calAnchor 当天生效——**比 calAnchor 更早的交易日一律可补**
//     (过去交易日的资金数据定义上早就发布了,缺了就是我们漏了,不该再问探测);
//  ③ 加滞后闸门:过了 moneyflow 应出的时点还没有 calAnchor 快照 → 必须告警,
//     不许再返回一个安静的 upToDate。
import { NextRequest, NextResponse } from "next/server";
import { isCronAuthorized } from "@/lib/api-guard";
import { alertCron } from "@/lib/monitor";
import { todayISO } from "@/lib/date";
import {
  latestFundYmd,
  ashareTradingDaysWindow,
  isAshareTradingDay,
  prevAshareTradingDay,
} from "@/lib/tushare";
import { buildSegmentDayMetrics } from "@/lib/market-intent/metrics";
import { classifyIntent } from "@/lib/market-intent/rules";
import { saveSnapshots, storedYmdSet, loadHistory, latestSnapshots } from "@/lib/market-intent/store";
import { buildDailyJudgments, saveDailyJudgments } from "@/lib/judgment";
import type { SegmentIntentSnapshot } from "@/lib/market-intent/types";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const LOOKBACK_DAYS = 20; // 交易日窗口:20 日分位/位置字段的最大需求
const BACKFILL_CAP = 5; // 单次最多补几天(hnd1→Tushare 路径偶发劣化,保守防超时)
const PROBE_TIMEOUT_MS = 20000;
const PROBE_RETRIES = 1; // 探测落后于交易日历时再试一次(tsCall 内部已有 3 次退避重试,外层不必多堆)
const LAG_ALERT_CST_HOUR = 19; // moneyflow 一般 18 点前后出;19 点还没拿到才算异常,17:10 那班不误报
// 当日快照最早可算的北京时间(A 股 15:00 收盘;留出结算余量,与 17:10 那班对齐)。
// 必须有这道闸:Tushare 的 moneyflow 在**盘中就会返回行**(2026-08-19 14:40 实测 20260819
// 已有 5541 行),而 latestFundYmd 只看"有没有行"就认定今天已就绪。盘中跑一次,当日快照
// 就建在半天数据上,而且一旦落库即被视为"已存"、后面几班不再重算——等于用半天行情锁死当日判断。
const SNAPSHOT_EARLIEST_CST_HOUR = 17;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// 北京时间小时(滞后闸门只在"数据本该出了"之后才报警)
const cstHour = () =>
  Number(
    new Intl.DateTimeFormat("en-GB", {
      timeZone: "Asia/Shanghai",
      hour: "2-digit",
      hourCycle: "h23",
    }).format(new Date())
  );

// 交易日历口径的「最近交易日」(≤ 今天)。与"资金就绪日"分开:
// 前者回答"最新那天该有数据吗",后者回答"那天的数据出了吗"——8/18 就是把两者混为一谈丢的。
// onUnknown:false = Tushare 不可达时不硬认今天是交易日(宁可保守退到上一交易日,避免周末误报滞后)。
async function latestTradingYmd(todayIso: string): Promise<string | null> {
  if (await isAshareTradingDay(todayIso, { onUnknown: false })) return todayIso.replace(/-/g, "");
  const prev = await prevAshareTradingDay(todayIso);
  return prev ? prev.replace(/-/g, "") : null;
}

// 资金就绪日探测(带超时)。返回 null = Tushare 完全不可达。
async function probeFundYmd(todayIso: string): Promise<string | null> {
  return Promise.race([
    latestFundYmd(todayIso).catch(() => null),
    new Promise<null>((r) => setTimeout(() => r(null), PROBE_TIMEOUT_MS)),
  ]);
}

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

// 滞后闸门:最近交易日还没有快照,且已过 moneyflow 应出的时点 → 告警。
// 这条是本次事故的正解——数据丢不可怕,丢了没人知道才可怕。
async function alertIfLagging(calAnchor: string | null, stored: Set<string>, headYmd: string | null) {
  if (!calAnchor || stored.has(calAnchor)) return false;
  if (cstHour() < LAG_ALERT_CST_HOUR) return false; // 盘后早班:今天的数据本来就还没出,不报
  await alertCron(
    "market-intent 滞后",
    `⚠️ 最近交易日 ${calAnchor} 仍无快照(资金就绪日探测=${headYmd ?? "不可达"})。` +
      `首页「今日推理」会停在更早的日期。先查 Tushare moneyflow ${calAnchor} 是否可取;` +
      `确认可取后手动跑一次本端点即可回补。`
  ).catch(() => null);
  return true;
}

export async function GET(req: NextRequest) {
  if (!isCronAuthorized(req)) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }
  const todayIso = todayISO();
  const calAnchor = await latestTradingYmd(todayIso).catch(() => null);

  // 资金就绪日:今天收盘后 moneyflow 已出 → 今天;否则上一交易日。
  // 探测结果落后于交易日历时重试——8/18 两班都是单次探测失败就把一整天丢了,
  // 而事后从同一台机直连 Tushare,当天 moneyflow 是有数据的(瞬时故障)。
  let headYmd = await probeFundYmd(todayIso);
  for (let i = 0; i < PROBE_RETRIES && calAnchor && (!headYmd || headYmd < calAnchor); i++) {
    await sleep(4000);
    const again = await probeFundYmd(todayIso);
    if (again && (!headYmd || again > headYmd)) headYmd = again;
  }

  const degraded = !headYmd;
  if (degraded) {
    // Tushare 完全不可达:仍然按 DB 已有快照刷一遍 Judgment(规则更新即生效),
    // 但**不再直接 return**——过去交易日的缺口依然可能补得动,交给下面统一逻辑判断。
    const latest = await latestSnapshots().catch(() => null);
    if (!latest) {
      await alertCron("market-intent", "⚠️ Market Intent:Tushare 不可达且库内无历史快照,本班跳过").catch(() => null);
      return NextResponse.json({ ok: false, error: "no_fund_ymd" }, { status: 200 });
    }
  }

  // 窗口锚在交易日历上(不再是 headYmd):这样「昨天缺了快照」今天一定看得见。
  const windowEnd = calAnchor ?? headYmd;
  if (!windowEnd) {
    await alertCron("market-intent", "⚠️ Market Intent:交易日历与资金就绪日都拿不到,本班跳过").catch(() => null);
    return NextResponse.json({ ok: false, error: "no_anchor" }, { status: 200 });
  }
  const days = await ashareTradingDaysWindow(windowEnd, LOOKBACK_DAYS);

  const stored = await storedYmdSet(days[0]).catch(() => new Set<string>());
  // force=1:只重算最新一天(规则调优后刷新当日判定用;不重写更早历史——Track 要看「当时判断了什么」)
  if (req.nextUrl.searchParams.get("force") === "1" && headYmd) stored.delete(headYmd);

  // 可算日:过去交易日无条件可算(数据定义上已发布);只有 calAnchor 当天要两个条件同时成立
  // ——资金就绪探测认账,且已过收盘结算时点(防盘中半天数据落库,见上方常量注释)。
  const todayYmd = todayIso.replace(/-/g, "");
  const anchorIsToday = windowEnd === todayYmd;
  const settled = !anchorIsToday || cstHour() >= SNAPSHOT_EARLIEST_CST_HOUR;
  const ready = (d: string) =>
    d < windowEnd || (settled && headYmd !== null && headYmd >= d);
  const missing = days.filter((d) => !stored.has(d) && ready(d));
  const notReady = days.filter((d) => !stored.has(d) && !ready(d));

  if (missing.length === 0) {
    await persistJudgments(); // 快照已齐也刷 Judgment(规则更新后重跑即生效,4 行 upsert 幂等)
    const lagged = await alertIfLagging(calAnchor, stored, headYmd);
    return NextResponse.json({ ok: true, upToDate: true, head: headYmd, anchor: calAnchor, notReady, settled, lagged });
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

  // 只要落了新快照就重合成 Judgment(原来只在"最新日落定"时刷,回补了旧日却不刷,
  // 首页依旧显示老判断——顺手一起修)
  if (done.length > 0) await persistJudgments();
  for (const d of done) stored.add(d);

  const remaining = missing.length - done.length - failed.length;
  if (done.length > 0 && (remaining > 0 || done.length > 1)) {
    // 回补发生时给一条 notice(与 outcome 自愈同风格),日常单日跑不打扰
    await alertCron(
      "market-intent 回补",
      `✅ Market Intent 已补 ${done.length} 个交易日(${done[0]}~${done[done.length - 1]}),窗口内仍缺 ${remaining} 天,下班次继续`
    ).catch(() => null);
  }
  const lagged = await alertIfLagging(calAnchor, stored, headYmd);
  return NextResponse.json({
    ok: failed.length === 0,
    done,
    failed,
    remaining,
    head: headYmd,
    anchor: calAnchor,
    notReady,
    settled,
    lagged,
    degraded,
  });
}
