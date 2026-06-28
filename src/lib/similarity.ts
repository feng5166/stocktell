// P1 历史相似性:某 A 股 vs 其主关联美股,过去 2 年"美股单日异动 → A 股次一交易日表现"的统计。
// 透明口径 + 小样本警示 + 明确"历史统计非预测",守合规红线。
// 数据:美股历史走 Yahoo(lib/yahoo),A 股历史走 Tushare daily。
import { STOCK_MAP, resolvePeer } from "@/data/stocks";
import { edgeInfo, type Strength } from "@/data/relations";
import { usDailyHistory } from "@/lib/yahoo";
import { dailyHistory } from "@/lib/tushare";

const THRESH = 2; // 美股单日 |涨跌| ≥ 2% 视为异动
const RANK: Record<Strength, number> = { 强: 3, 中: 2, 弱: 1 };

export interface SimGroup {
  dir: "涨" | "跌"; // 美股异动方向
  events: number; // 该方向异动次数(且能对到 A 股次日)
  sameDir: number; // 次日 A 股同向次数
  avgNext: number; // 次日 A 股平均涨跌 %
}

export interface SimilarityResult {
  triggerCode: string;
  triggerName: string;
  aName: string;
  windowYears: number;
  total: number;
  groups: SimGroup[];
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

export async function similarityFor(
  aCode: string
): Promise<SimilarityResult | null> {
  const a = STOCK_MAP[aCode];
  if (!a || a.market !== "A股") return null;

  // 主关联美股:relations 里的美股,取关系最强的一只
  const triggers = a.relations
    .map((t) => resolvePeer(t))
    .filter((p): p is NonNullable<typeof p> => !!p && p.market === "美股");
  if (triggers.length === 0) return null;
  const primary = triggers
    .map((t) => ({ t, r: RANK[edgeInfo(aCode, t.code)?.strength ?? "弱"] }))
    .sort((x, y) => y.r - x.r)[0].t;

  const [us, aHist] = await Promise.all([
    usDailyHistory(primary.code, "2y"),
    dailyHistory(aCode, ymdYearsAgo(2)),
  ]);
  if (us.length < 20 || aHist.length < 20) return null;

  const aDates = aHist.map((b) => b.date); // 升序
  const aByDate = new Map(aHist.map((b) => [b.date, b.pct]));
  // 美股日 D 的"次日 A 股" = 第一个 > D 的 A 股交易日(隔夜映射)
  const nextAPct = (usDate: string): number | null => {
    for (const d of aDates) if (d > usDate) return aByDate.get(d) ?? null;
    return null;
  };

  const mk = (dir: "涨" | "跌"): SimGroup => {
    const evts = us.filter((b) =>
      dir === "涨" ? b.pct >= THRESH : b.pct <= -THRESH
    );
    let events = 0;
    let sameDir = 0;
    let sum = 0;
    for (const e of evts) {
      const np = nextAPct(e.date);
      if (np === null) continue;
      events++;
      sum += np;
      if (dir === "涨" ? np > 0 : np < 0) sameDir++;
    }
    return {
      dir,
      events,
      sameDir,
      avgNext: events ? Math.round((sum / events) * 100) / 100 : 0,
    };
  };

  const groups = [mk("涨"), mk("跌")].filter((g) => g.events > 0);
  const total = groups.reduce((s, g) => s + g.events, 0);
  if (total === 0) return null;

  return {
    triggerCode: primary.code,
    triggerName: primary.name,
    aName: a.name,
    windowYears: 2,
    total,
    groups,
  };
}
