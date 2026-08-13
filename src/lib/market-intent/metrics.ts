// Market Intent 指标构建(2.2.2):Tushare 两张全市场表(daily/moneyflow 明细)→ 8 板块聚合指标。
// 趋势类字段(3/5 日资金、连续天数、20 日分位、5/10/20 日位置)从【历史快照】推,
// 不重复回源——历史不足时字段为 null,规则引擎按低置信度/跳规则降级,绝不硬造。
import { dailyQuotesByDate, moneyflowDetailByDate } from "@/lib/tushare";
import { listBriefing } from "@/lib/briefings";
import { STOCK_MAP } from "@/data/stocks";
import { INTENT_SEGMENTS, segmentMembers, type IntentSegment } from "./segments";
import type { SegmentDayMetrics } from "./types";

const MIN_MEMBERS = 5; // 有行情数据的成员数下限,低于此不产该板块指标(数据面不完整)

const r2 = (v: number) => Math.round(v * 100) / 100;
const ymdToISO = (ymd: string) => `${ymd.slice(0, 4)}-${ymd.slice(4, 6)}-${ymd.slice(6, 8)}`;

// 当日已发布简报是否命中板块:触发源的 sector 归属本板块,或映射标的在成员内。
function chainEventHit(
  seg: IntentSegment,
  memberSet: Set<string>,
  items: { triggerCode: string | null; beneficiaries: { code: string }[] }[]
): boolean {
  for (const it of items) {
    if (it.triggerCode) {
      const t = STOCK_MAP[it.triggerCode];
      if (t && seg.sectors.includes(t.sector)) return true;
    }
    if (it.beneficiaries.some((b) => memberSet.has(b.code))) return true;
  }
  return false;
}

// 主力净额连续同向天数(含今日):+n 连续净流入 / -n 连续净流出;今日为 0 记 0。
function streakOf(todayMain: number, priorMains: number[]): number {
  const sign = todayMain > 0 ? 1 : todayMain < 0 ? -1 : 0;
  if (sign === 0) return 0;
  let n = 1;
  for (let i = priorMains.length - 1; i >= 0; i--) {
    const s = priorMains[i] > 0 ? 1 : priorMains[i] < 0 ? -1 : 0;
    if (s !== sign) break;
    n++;
  }
  return sign * n;
}

// 分位:v 在 arr(含 v)中的百分位 0-1。
function percentile(v: number, arr: number[]): number {
  const below = arr.filter((x) => x <= v).length;
  return r2(below / arr.length);
}

export async function buildSegmentDayMetrics(
  ymd: string,
  history: Map<string, SegmentDayMetrics[]> // segment → 既往 metrics(ymd 升序,不含今日)
): Promise<SegmentDayMetrics[]> {
  const [quotes, flows, items] = await Promise.all([
    dailyQuotesByDate(ymd), // strict:源挂即抛,由 cron 统一告警,不产半截指标
    moneyflowDetailByDate(ymd),
    listBriefing({ date: ymdToISO(ymd), status: "published" }).catch(() => []),
  ]);
  if (quotes.size === 0) throw new Error(`daily 无数据 ymd=${ymd}(非交易日或数据未出)`);

  const out: SegmentDayMetrics[] = [];
  for (const seg of INTENT_SEGMENTS) {
    const members = segmentMembers(seg);
    const memberSet = new Set(members.map((m) => m.code));
    let up = 0, down = 0, pctSum = 0, amountYi = 0, mainNetYi = 0;
    let retailNetYi = 0, retailSeen = 0, quoted = 0;
    for (const m of members) {
      const q = quotes.get(m.code);
      if (!q) continue;
      quoted++;
      pctSum += q.pct;
      amountYi += q.amountYi;
      if (q.pct > 0) up++;
      else if (q.pct < 0) down++;
      const f = flows.get(m.code);
      if (f) {
        mainNetYi += f.mainYi;
        retailNetYi += f.retailYi;
        retailSeen++;
      }
    }
    if (quoted < MIN_MEMBERS) continue;

    const avgPct = r2(pctSum / quoted);
    const prior = history.get(seg.key) ?? [];
    const priorMains = prior.map((p) => p.mainNetYi);
    const priorAmounts = prior.map((p) => p.amountYi);
    const priorPcts = prior.map((p) => p.avgPct);
    const sumLast = (arr: number[], n: number, today: number): number | null =>
      arr.length >= n - 1 ? r2(arr.slice(-(n - 1)).reduce((a, b) => a + b, 0) + today) : null;

    const amountWindow = [...priorAmounts.slice(-19), amountYi];
    const leaderCode = seg.leaders.find((c) => quotes.has(c)) ?? null;
    const leaderPct = leaderCode ? r2(quotes.get(leaderCode)!.pct) : null;

    out.push({
      ymd,
      segment: seg.key,
      memberCount: quoted,
      avgPct,
      upCount: up,
      downCount: down,
      breadth: r2(up / quoted),
      amountYi: r2(amountYi),
      amountPctl20: amountWindow.length >= 10 ? percentile(amountYi, amountWindow) : null,
      amountChgPct:
        priorAmounts.length > 0 && priorAmounts[priorAmounts.length - 1] > 0
          ? r2(((amountYi - priorAmounts[priorAmounts.length - 1]) / priorAmounts[priorAmounts.length - 1]) * 100)
          : null,
      mainNetYi: r2(mainNetYi),
      mainStrength: amountYi > 0 ? Math.round((mainNetYi / amountYi) * 10000) / 10000 : 0,
      retailNetYi: retailSeen > 0 ? r2(retailNetYi) : null,
      mainNet3dYi: sumLast(priorMains, 3, mainNetYi),
      mainNet5dYi: sumLast(priorMains, 5, mainNetYi),
      mainNetStreak: streakOf(mainNetYi, priorMains),
      leaderCode,
      leaderPct,
      leaderRelPct: leaderPct !== null ? r2(leaderPct - avgPct) : null,
      hasChainEvent: chainEventHit(seg, memberSet, items),
      pos5dPct: sumLast(priorPcts, 5, avgPct),
      pos10dPct: sumLast(priorPcts, 10, avgPct),
      pos20dPct: sumLast(priorPcts, 20, avgPct),
    });
  }
  return out;
}
