// 简报记账:简报当日收盘后,把每条简报的受益 A 股实际表现记下来,等用户查账。
// 判命中规则透明:触发美股涨→期待 A 股涨,跌→期待 A 股跌;同向且 |涨跌| ≥ 阈值记 hit。
// 只在接了 Postgres 时记账;没库则跳过(返回 skipped),不写本地。
import { getPrisma } from "@/lib/prisma";
import { fetchQuotes } from "@/lib/quotes";
import { listBriefing } from "@/lib/briefings";

export const HIT_THRESHOLD = 1.0; // 同向涨跌 ≥1% 记"跟上了"

export interface OutcomeRow {
  id: string;
  briefingId: string;
  date: string;
  title: string;
  impact: string;
  code: string;
  name: string;
  expected: string; // "涨" / "跌"
  change: number | null; // 评估日 A 股实际涨跌%
  hit: boolean | null; // null = 当时取不到行情
  isBacktest: boolean; // true=历史回测(明牌)
  evaluatedAt: string;
}

/* eslint-disable @typescript-eslint/no-explicit-any */
function fromRow(r: any): OutcomeRow {
  return {
    id: r.id,
    briefingId: r.briefingId,
    date: r.date,
    title: r.title,
    impact: r.impact,
    code: r.code,
    name: r.name,
    expected: r.expected,
    change: r.change ?? null,
    hit: r.hit ?? null,
    isBacktest: r.isBacktest ?? false,
    evaluatedAt:
      r.evaluatedAt instanceof Date ? r.evaluatedAt.toISOString() : r.evaluatedAt,
  };
}
/* eslint-enable @typescript-eslint/no-explicit-any */

// 评估某天的简报:回填受益股当日涨跌 + 命中。幂等(briefingId+code 唯一,upsert)。
export async function recordOutcomes(date: string): Promise<{
  ok: boolean;
  skipped?: string;
  evaluated: number;
}> {
  const db = getPrisma();
  if (!db) return { ok: true, skipped: "no-db", evaluated: 0 };

  const briefings = await listBriefing({ date, status: "published" });
  if (briefings.length === 0)
    return { ok: true, skipped: "no-briefing", evaluated: 0 };

  // 所有受益 A 股代码,一次取行情
  const codes = Array.from(
    new Set(briefings.flatMap((b) => b.beneficiaries.map((x) => x.code)))
  );
  const { quotes } = await fetchQuotes(codes);

  let evaluated = 0;
  for (const b of briefings) {
    // 触发方向:涨→期待 A 股涨;跌→期待 A 股跌;拿不到方向按"涨"兜底
    const expected: "涨" | "跌" = (b.triggerChange ?? 0) < 0 ? "跌" : "涨";
    for (const ben of b.beneficiaries) {
      const change = quotes[ben.code]?.change ?? null;
      const hit =
        change === null
          ? null
          : expected === "涨"
          ? change >= HIT_THRESHOLD
          : change <= -HIT_THRESHOLD;
      await db.briefingOutcome.upsert({
        where: { briefingId_code: { briefingId: b.id, code: ben.code } },
        create: {
          briefingId: b.id,
          date,
          title: b.title,
          impact: b.impact,
          code: ben.code,
          name: ben.name,
          expected,
          change,
          hit,
          isBacktest: false,
        },
        update: { change, hit, evaluatedAt: new Date() },
      });
      evaluated++;
    }
  }
  return { ok: true, evaluated };
}

// 查账:近若干条结果明细(按日期倒序)。backtest 省略=全部;true=仅回测;false=仅实盘。
export async function listOutcomes(
  take = 300,
  backtest?: boolean
): Promise<OutcomeRow[]> {
  const db = getPrisma();
  if (!db) return [];
  const rows = await db.briefingOutcome.findMany({
    where: backtest === undefined ? undefined : { isBacktest: backtest },
    orderBy: [{ date: "desc" }, { impact: "asc" }],
    take,
  });
  return rows.map(fromRow);
}

export interface HitStats {
  evaluated: number; // 已判定(change 非空)条数
  hits: number;
  rate: number | null; // 命中率 0-1;无样本为 null
}

// 只用到 impact/hit,接受最小形状(便于用轻量 select 算统计,不拉全行)
type StatRow = { impact: string; hit: boolean | null };

export function summarize(rows: StatRow[]): HitStats {
  const judged = rows.filter((r) => r.hit !== null);
  const hits = judged.filter((r) => r.hit).length;
  return {
    evaluated: judged.length,
    hits,
    rate: judged.length ? hits / judged.length : null,
  };
}

// 分页取明细(真分页:滚到底才向服务器要下一页)。多取 1 条判 hasMore。
export async function pageOutcomes(
  backtest: boolean,
  offset: number,
  limit: number
): Promise<{ rows: OutcomeRow[]; hasMore: boolean }> {
  const db = getPrisma();
  if (!db) return { rows: [], hasMore: false };
  const rows = await db.briefingOutcome.findMany({
    where: { isBacktest: backtest },
    // 加 id 唯一兜底键:同日同影响也有稳定次序,跨页不重复/不漏
    orderBy: [{ date: "desc" }, { impact: "asc" }, { id: "asc" }],
    skip: offset,
    take: limit + 1,
  });
  const hasMore = rows.length > limit;
  return { rows: rows.slice(0, limit).map(fromRow), hasMore };
}

// 命中率统计:命中率需全量,但只 select impact/hit 两字段算,不拉全行(快、payload 小)。
export async function statsOutcomes(
  backtest: boolean
): Promise<{ stats: HitStats; byImpact: { impact: string; stats: HitStats }[] }> {
  const db = getPrisma();
  if (!db) return { stats: { evaluated: 0, hits: 0, rate: null }, byImpact: [] };
  const rows = await db.briefingOutcome.findMany({
    where: { isBacktest: backtest },
    select: { impact: true, hit: true },
  });
  return { stats: summarize(rows), byImpact: summarizeByImpact(rows) };
}

// 样本低于此数不亮总命中率,只说"样本积累中"——早期几条数据的命中率没意义,亮出来反而误导。
export const MIN_SAMPLE = 10;

// 按影响等级(高/中/低)拆命中率,只返回有样本的等级。
export function summarizeByImpact(
  rows: StatRow[]
): { impact: string; stats: HitStats }[] {
  return (["高", "中", "低"] as const)
    .map((impact) => ({
      impact,
      stats: summarize(rows.filter((r) => r.impact === impact)),
    }))
    .filter((x) => x.stats.evaluated > 0);
}
