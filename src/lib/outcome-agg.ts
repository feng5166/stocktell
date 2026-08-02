// 复盘回写 M3(2.3 P1-1,PRD prd-2.3-iteration-review §5):
// briefing_outcomes(实盘)→ 按 链×环节×关系档 与 按 code 的「历史同向统计」聚合快照。
// 存储:复用 quotes_cache 当 KV(与 chain-sentiment-v1 同款,免迁移);写入方=outcome cron,
// 读取方=insight 页 / 股票页(读快照不现算,页面零 groupBy)。
// 合规红线(2.1-W3 口径延续):禁词「有效率」;只叫【历史同向统计】;展示必带「历史统计·非预测」;
// 页面只出「同向 X/N」计数不出百分比;样本 < MIN_SAMPLE 显示「样本积累中」。
import { getPrisma } from "@/lib/prisma";
import { STOCK_MAP } from "@/data/stocks";
import { CHAINS, FALLBACK_SEGMENT } from "@/data/chains";
import { resolvePrimary, resolveInChainMappingLabel } from "@/lib/relation-resolver";
import { chainIdFromSlug } from "@/lib/relation-rank";
export { MIN_SAMPLE } from "@/lib/linkage";
import { MIN_SAMPLE } from "@/lib/linkage";

const CACHE_ID = "outcome-agg-v1";

export type SegmentAgg = {
  chainId: string; // 关系模型链 id(ai-infra / data-center-power …)
  segment: string; // 注册链环节名
  relation: string; // 前台关系标签(直接映射/间接映射/情绪映射/弱映射)
  n: number; // 已判定次数(实盘)
  hits: number; // 次日同向次数
};
export type CodeAgg = {
  code: string;
  chainId: string | null;
  n: number;
  hits: number;
  lastDate: string | null; // 最近一次判定的简报日
};
export type OutcomeAggSnapshot = {
  updatedAt: string;
  bySegment: SegmentAgg[];
  byCode: CodeAgg[];
};

// code → (关系链id, 注册链环节名)。环节映射与 insight 生成侧同规则:sector ∈ segment.sectors。
function codeIdentity(code: string): { relChainId: string | null; segment: string | null } {
  const rel = resolvePrimary(code);
  if (!rel) return { relChainId: null, segment: null };
  const chain = Object.values(CHAINS).find(
    (c) => c.segments?.length && chainIdFromSlug(c.insightSlug) === rel.chainId
  );
  if (!chain?.segments) return { relChainId: rel.chainId, segment: null };
  const sector = STOCK_MAP[code]?.sector;
  const seg = sector
    ? chain.segments.find((s) => (s.sectors as readonly string[]).includes(sector))?.name
    : undefined;
  return { relChainId: rel.chainId, segment: seg ?? FALLBACK_SEGMENT };
}

// 写入:outcome cron 回填后调用。全量重算(表小:每日 ≤12 条 × 天数;groupBy 下推 DB)。
export async function writeOutcomeAgg(): Promise<{ segments: number; codes: number } | null> {
  const db = getPrisma();
  if (!db) return null;
  const [grouped, lastDates] = await Promise.all([
    db.briefingOutcome.groupBy({
      by: ["code", "hit"],
      where: { isBacktest: false, hit: { not: null } },
      _count: { _all: true },
    }),
    db.briefingOutcome.groupBy({
      by: ["code"],
      where: { isBacktest: false, hit: { not: null } },
      _max: { date: true },
    }),
  ]).catch(() => [[], []] as const);

  const byCodeCount = new Map<string, { n: number; hits: number }>();
  for (const g of grouped as Array<{ code: string; hit: boolean | null; _count: { _all: number } }>) {
    const m = byCodeCount.get(g.code) ?? { n: 0, hits: 0 };
    m.n += g._count._all;
    if (g.hit === true) m.hits += g._count._all;
    byCodeCount.set(g.code, m);
  }
  if (byCodeCount.size === 0) return { segments: 0, codes: 0 };
  const lastByCode = new Map(
    (lastDates as Array<{ code: string; _max: { date: string | null } }>).map((r) => [r.code, r._max.date])
  );

  const segAgg = new Map<string, SegmentAgg>();
  const byCode: CodeAgg[] = [];
  for (const [code, m] of Array.from(byCodeCount)) {
    const { relChainId, segment } = codeIdentity(code);
    byCode.push({ code, chainId: relChainId, n: m.n, hits: m.hits, lastDate: lastByCode.get(code) ?? null });
    if (!relChainId || !segment || segment === FALLBACK_SEGMENT) continue;
    const relation = resolveInChainMappingLabel(code, relChainId) ?? "情绪映射";
    const key = `${relChainId}|${segment}|${relation}`;
    const s = segAgg.get(key) ?? { chainId: relChainId, segment, relation, n: 0, hits: 0 };
    s.n += m.n;
    s.hits += m.hits;
    segAgg.set(key, s);
  }

  const snapshot: OutcomeAggSnapshot = {
    updatedAt: new Date().toISOString(),
    bySegment: Array.from(segAgg.values()),
    byCode,
  };
  await db.quotesCache.upsert({
    where: { id: CACHE_ID },
    create: { id: CACHE_ID, data: snapshot as unknown as object },
    update: { data: snapshot as unknown as object, updatedAt: new Date() },
  });
  return { segments: snapshot.bySegment.length, codes: byCode.length };
}

// 读取(页面消费;失败/缺失 → null,页面不渲染角标,绝不显假 0)
export async function readOutcomeAgg(): Promise<OutcomeAggSnapshot | null> {
  const db = getPrisma();
  if (!db) return null;
  const row = await db.quotesCache.findUnique({ where: { id: CACHE_ID } }).catch(() => null);
  return (row?.data as unknown as OutcomeAggSnapshot) ?? null;
}

// 展示文案(单一来源,合规口径集中在这):
// - 样本 ≥ MIN_SAMPLE:「近 N 次同类触发,次日同向 X/N(历史统计·非预测)」——只出计数不出百分比
// - 样本 > 0 但不足:「历史样本积累中(N 次)」
// - 无样本:null(不渲染,不显假 0)
export function segBadgeText(
  snap: OutcomeAggSnapshot | null,
  relChainId: string | undefined,
  segment: string
): string | null {
  if (!snap || !relChainId) return null;
  // 环节名归一化(静态「光模块 / 高速互连」vs 配置「光模块/高速互连」空格差,与 buildDailyHops 同规则)
  const norm = (s: string) => s.replace(/\s+/g, "");
  const rows = snap.bySegment.filter((r) => r.chainId === relChainId && norm(r.segment) === norm(segment));
  if (rows.length === 0) return null;
  const n = rows.reduce((s, r) => s + r.n, 0);
  const hits = rows.reduce((s, r) => s + r.hits, 0);
  if (n === 0) return null;
  if (n < MIN_SAMPLE) return `历史样本积累中(${n} 次)`;
  return `近 ${n} 次同类触发,次日同向 ${hits}/${n}(历史统计·非预测)`;
}

export function codeBadgeText(snap: OutcomeAggSnapshot | null, code: string): string | null {
  const row = snap?.byCode.find((r) => r.code === code);
  if (!row || row.n === 0) return null;
  if (row.n < MIN_SAMPLE) return `历史样本积累中(${row.n} 次)`;
  return `近 ${row.n} 次被事件点名,次日同向 ${row.hits}/${row.n}(历史统计·非预测)`;
}
