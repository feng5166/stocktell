// 联动有效率:某美股单日 ≥2% 异动 → 对应 A 股次一交易日"同向且 ≥1%"的占比。
// 走 backtest 全历史(Yahoo 美股日线 + Tushare A 股日线),不是稀疏的 BriefingOutcome。
// 透明口径 + 小样本只给样本数不亮百分比 + 明确"联动有效率≠准确率、非预测",守合规红线。
import { STOCK_MAP } from "@/data/stocks";
import { usDailyHistory } from "@/lib/yahoo";
import { dailyHistory } from "@/lib/tushare";

const US_THRESH = 2; // 美股单日 |涨跌| ≥2% 视为异动
const A_HIT = 1; // A 股次日 同向且 |涨跌| ≥1% 视为"联动兑现"
export const MIN_SAMPLE = 12; // 样本 <12 不亮百分比,只给样本数(小样本统计不可靠)

export interface LinkageStat {
  events: number; // 美股≥2%异动且能对到 A 股次日 的次数
  hits: number; // 其中 A 股次日 同向≥1% 的次数
  rate: number; // hits/events(0..1)
  avgNext: number; // A 股次日平均涨跌 %
  windowYears: number;
}

function ymdYearsAgo(years: number): string {
  const d = new Date();
  d.setFullYear(d.getFullYear() - years);
  return new Intl.DateTimeFormat("en-CA", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  })
    .format(d)
    .replace(/-/g, "");
}

export async function linkageStat(
  usCode: string,
  aCode: string
): Promise<LinkageStat | null> {
  const us = STOCK_MAP[usCode];
  const a = STOCK_MAP[aCode];
  if (!us || us.market !== "美股" || !a || a.market !== "A股") return null;

  const [usH, aH] = await Promise.all([
    usDailyHistory(usCode, "2y"),
    dailyHistory(aCode, ymdYearsAgo(2)),
  ]);
  if (usH.length < 20 || aH.length < 20) return null;

  const aDates = aH.map((b) => b.date); // 升序
  const aByDate = new Map(aH.map((b) => [b.date, b.pct]));
  // 美股日 D 的"次日 A 股" = 第一个 > D 的 A 股交易日(隔夜映射)
  const nextAPct = (usDate: string): number | null => {
    for (const d of aDates) if (d > usDate) return aByDate.get(d) ?? null;
    return null;
  };

  let events = 0;
  let hits = 0;
  let sum = 0;
  for (const b of usH) {
    if (Math.abs(b.pct) < US_THRESH) continue;
    const np = nextAPct(b.date);
    if (np === null) continue;
    events++;
    sum += np;
    const sameDir = b.pct > 0 ? np > 0 : np < 0;
    if (sameDir && Math.abs(np) >= A_HIT) hits++;
  }
  if (events === 0) return null;

  return {
    events,
    hits,
    rate: Math.round((hits / events) * 1000) / 1000,
    avgNext: Math.round((sum / events) * 100) / 100,
    windowYears: 2,
  };
}
