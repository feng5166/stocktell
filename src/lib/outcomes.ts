// 简报记账:简报当日收盘后,把每条简报的受益 A 股实际表现记下来,等用户查账。
// 判命中规则透明:触发美股涨→期待 A 股涨,跌→期待 A 股跌;同向且 |涨跌| ≥ 阈值记 hit。
// 只在接了 Postgres 时记账;没库则跳过(返回 skipped),不写本地。
import { getPrisma } from "@/lib/prisma";
import { fetchQuotes } from "@/lib/quotes";
import { listBriefing } from "@/lib/briefings";
import { dailyByDate } from "@/lib/tushare";
import { resolvePrimary } from "@/lib/relation-resolver";

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
  // P1 Phase 2【预埋】:从统一关系模型算出的链身份,供后续按 链/环节/关系档 拆"关系验证率"
  // (如 direct 映射验证率 vs 情绪映射验证率)。读时计算,不落库、无需迁移。
  chainId?: string;
  segmentId?: string;
  relationType?: string;
}

/* eslint-disable @typescript-eslint/no-explicit-any */
function fromRow(r: any): OutcomeRow {
  const rel = resolvePrimary(r.code); // 统一关系源(唯一入口),按 code 查链身份
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
    chainId: rel?.chainId,
    segmentId: rel?.segmentId,
    relationType: rel?.relationType,
  };
}
/* eslint-enable @typescript-eslint/no-explicit-any */

// 收盘记账自愈(2026-07-08,负责人:「后续能自修复吗」)。背景:15:30 主跑遇日历源/行情源
// 瞬时故障会 fail-safe 跳过(正确),但恢复靠人工 backfill——本函数把恢复也自动化:
// 回看近 N 日,凡「有已发布简报 + 确认为交易日 + 无任何 outcome 记录」的日子,用 EOD
// 历史价补记(recordOutcomes 幂等 upsert,收盘后 EOD 稳定,晚补与准点结果一致)。
// 每次最多补 2 天(60s 函数预算);日历仍不可用的日子留给下一轮——自愈是逐轮收敛的。
export async function catchUpMissedOutcomes(
  today: string,
  opts: { lookbackDays?: number; maxDates?: number } = {}
): Promise<{ healed: Array<{ date: string; evaluated: number; judged: number }>; checked: number }> {
  const db = getPrisma();
  const healed: Array<{ date: string; evaluated: number; judged: number }> = [];
  if (!db) return { healed, checked: 0 };
  const lookback = opts.lookbackDays ?? 5;
  const maxDates = opts.maxDates ?? 2;
  const { isAshareTradingDay } = await import("@/lib/tushare");
  let checked = 0;
  for (let i = 1; i <= lookback && healed.length < maxDates; i++) {
    const d = new Date(new Date(`${today}T12:00:00Z`).getTime() - i * 86400_000)
      .toISOString()
      .slice(0, 10);
    checked++;
    try {
      const has = await db.briefingOutcome.count({ where: { date: d, isBacktest: false } });
      if (has > 0) continue; // 已记账
      const briefings = await listBriefing({ date: d, status: "published" });
      if (briefings.length === 0) continue; // 无简报=无账可记(休市/设计性)
      // fail-closed(不变量⑦):日历确认不了(unknown)绝不硬补,留给下一轮——
      // isAshareTradingDay 默认 onUnknown=true 是【交付路径】的宽松语义,这里必须显式收紧
      const open = await isAshareTradingDay(d, { onUnknown: false }).catch(() => false);
      if (!open) continue;
      const res = await recordOutcomes(d, { historical: true });
      if (res.ok && (res.evaluated ?? 0) > 0) {
        healed.push({ date: d, evaluated: res.evaluated ?? 0, judged: res.judged ?? 0 });
        // 复盘喂队列与主跑同轨(不变量#4:只入队不改档);fail-safe
        const { feedReviewQueueFromOutcomes } = await import("@/lib/relation-review");
        await feedReviewQueueFromOutcomes(d).catch(() => null);
      }
    } catch {
      /* 单日补记失败不阻断其余日子,下一轮再试 */
    }
  }
  return { healed, checked };
}

// 评估某天的简报:回填受益股当日涨跌 + 命中。幂等(briefingId+code 唯一,upsert)。
// historical=true 时用 Tushare 当日收盘涨跌幅(daily.pct_chg)取价,而非实时行情——
// 用于补录漏记的历史交易日(实时行情只反映"当下",过了那天就取不到当天收盘了)。
export async function recordOutcomes(
  date: string,
  opts: { historical?: boolean } = {}
): Promise<{
  ok: boolean;
  skipped?: string;
  evaluated: number;
  source?: string;
  judged?: number; // 真正判定了涨跌(change 非 null)的条数
  staleSkipped?: number; // 实时路径下 asOf≠记账日 被判未定的条数(停牌 or 源漂移)
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

  let judged = 0; // 真正判定涨跌(change 非 null)的条数
  let staleSkipped = 0; // 实时:asOf≠记账日 被判未定的条数
  // 取价:historical 用 Tushare 当日收盘(裸代码→pct_chg),否则用实时行情
  let changeOf: (code: string) => number | null;
  if (opts.historical) {
    const hist = await dailyByDate(date.replace(/-/g, ""));
    if (hist.size === 0) return { ok: true, skipped: "no-history", evaluated: 0 };
    changeOf = (c) => (hist.has(c) ? hist.get(c)! : null);
  } else {
    const { quotes } = await fetchQuotes(codes);
    // ⚠️ 校验 asOf==记账日:停牌/半日休市的票,行情源返回的是停牌前的陈旧快照
    // (change=停牌前末日涨跌、asOf=旧日期)。不校验会把陈旧涨跌当"当日收盘"写进战绩、
    // 把 hit 错判成 true/false(应为 null=未判定)。asOf 缺失也视为不可信 → null。
    // 同时统计"asOf 不匹配"的比例:少数=正常停牌;大面积=行情源格式漂移/故障(调用方据此告警)。
    changeOf = (c) => {
      const q = quotes[c];
      if (!q) return null;
      if (q.asOf !== date) {
        staleSkipped++;
        return null;
      }
      return q.change ?? null;
    };
  }

  let evaluated = 0;
  for (const b of briefings) {
    // 触发方向:涨→期待 A 股涨;跌→期待 A 股跌;拿不到方向按"涨"兜底
    const expected: "涨" | "跌" = (b.triggerChange ?? 0) < 0 ? "跌" : "涨";
    for (const ben of b.beneficiaries) {
      const change = changeOf(ben.code);
      if (change !== null) judged++;
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
        // 取不到行情(change=null)时只更新评估时间,绝不用 null 覆盖已记好的 change/hit
        // ——防"某票两源都缺价"的极端把已判定的战绩冲回未判定(核心产品数据,只进不退坏)。
        update:
          change === null
            ? { evaluatedAt: new Date() }
            : { change, hit, evaluatedAt: new Date() },
      });
      evaluated++;
    }
  }
  return {
    ok: true,
    evaluated,
    judged,
    staleSkipped,
    source: opts.historical ? "tushare-daily" : "realtime",
  };
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

// 分页取明细(真分页:滚到底才向服务器要下一页)。游标分页:cursorId = 上一页最后一行 id,
// 比 skip/offset 不随翻深变慢(借 (is_backtest,date) 复合索引 + id 唯一兜底键稳定 seek)。
// 多取 1 条判 hasMore。cursorId=null 取首页。
export async function pageOutcomes(
  backtest: boolean,
  cursorId: string | null,
  limit: number
): Promise<{ rows: OutcomeRow[]; hasMore: boolean; nextCursor: string | null }> {
  const db = getPrisma();
  if (!db) return { rows: [], hasMore: false, nextCursor: null };
  const rows = await db.briefingOutcome.findMany({
    where: { isBacktest: backtest },
    orderBy: [{ date: "desc" }, { impact: "asc" }, { id: "asc" }],
    take: limit + 1,
    ...(cursorId ? { cursor: { id: cursorId }, skip: 1 } : {}),
  });
  const hasMore = rows.length > limit;
  const page = rows.slice(0, limit).map(fromRow);
  return {
    rows: page,
    hasMore,
    nextCursor: hasMore && page.length ? page[page.length - 1].id : null,
  };
}

// 命中率统计:用 DB 侧 groupBy(impact,hit) 聚合计数,不再把整张 outcome 表拉进 Node 求和
// (随记账增长,旧实现每次进战绩页都全表扫两遍 = 实盘 + 回测)。返回形状保持不变。
export async function statsOutcomes(
  backtest: boolean
): Promise<{ stats: HitStats; byImpact: { impact: string; stats: HitStats }[] }> {
  const db = getPrisma();
  if (!db) return { stats: { evaluated: 0, hits: 0, rate: null }, byImpact: [] };
  const grouped = await db.briefingOutcome.groupBy({
    by: ["impact", "hit"],
    where: { isBacktest: backtest },
    _count: { _all: true },
  });

  const rate = (e: number, h: number): number | null => (e ? h / e : null);
  let evaluated = 0;
  let hits = 0;
  const byImpactMap = new Map<string, { evaluated: number; hits: number }>();
  for (const g of grouped) {
    if (g.hit === null) continue; // 未判定(取不到行情)不计入命中率分母
    const c = g._count._all;
    evaluated += c;
    if (g.hit === true) hits += c;
    const m = byImpactMap.get(g.impact) ?? { evaluated: 0, hits: 0 };
    m.evaluated += c;
    if (g.hit === true) m.hits += c;
    byImpactMap.set(g.impact, m);
  }

  const byImpact = (["高", "中", "低"] as const)
    .map((impact) => {
      const m = byImpactMap.get(impact) ?? { evaluated: 0, hits: 0 };
      return {
        impact,
        stats: { evaluated: m.evaluated, hits: m.hits, rate: rate(m.evaluated, m.hits) },
      };
    })
    .filter((x) => x.stats.evaluated > 0);

  return { stats: { evaluated, hits, rate: rate(evaluated, hits) }, byImpact };
}

// 按关系档 / 按链拆复盘(2.1-W3:复盘的主口径从"涨跌命中"转向"关系验证")。
// 链身份不落库(读时经 resolvePrimary 解析=resolver 唯一入口)——但归并计数可以下推 DB:
// groupBy(code,hit) 返回 ≤ 2×code 数 的聚合行,不再把整表拉进 Node(二轮 review 小项②;
// 同文件 statsOutcomes 此前正是为此从全表扫迁到 groupBy 的)。
// direct/indirect/sentiment 分开统计正是差异化所在:直接映射的验证率和情绪映射的验证率
// 是两种含义,混在一起就退化回"涨跌有效率"。
export async function statsOutcomesByRelation(backtest: boolean): Promise<{
  byRelation: { relationType: string; stats: HitStats }[];
  byChain: { chainId: string; stats: HitStats }[];
}> {
  const db = getPrisma();
  if (!db) return { byRelation: [], byChain: [] };
  const grouped = await db.briefingOutcome
    .groupBy({
      by: ["code", "hit"],
      where: { isBacktest: backtest, hit: { not: null } },
      _count: { _all: true },
    })
    .catch(() => [] as Array<{ code: string; hit: boolean | null; _count: { _all: number } }>);
  const byCode = new Map<string, { judged: number; hits: number }>();
  for (const g of grouped) {
    const m = byCode.get(g.code) ?? { judged: 0, hits: 0 };
    m.judged += g._count._all;
    if (g.hit === true) m.hits += g._count._all;
    byCode.set(g.code, m);
  }
  const relAgg = new Map<string, { evaluated: number; hits: number }>();
  const chainAgg = new Map<string, { evaluated: number; hits: number }>();
  for (const [code, m] of Array.from(byCode.entries())) {
    const rel = resolvePrimary(code);
    const rt = rel?.relationType ?? "unmapped"; // 无静态关系的票单列,不消失(未覆盖≠没发生)
    const ra = relAgg.get(rt) ?? { evaluated: 0, hits: 0 };
    ra.evaluated += m.judged;
    ra.hits += m.hits;
    relAgg.set(rt, ra);
    if (rel) {
      const ca = chainAgg.get(rel.chainId) ?? { evaluated: 0, hits: 0 };
      ca.evaluated += m.judged;
      ca.hits += m.hits;
      chainAgg.set(rel.chainId, ca);
    }
  }
  const toStats = (m: { evaluated: number; hits: number }): HitStats => ({
    evaluated: m.evaluated,
    hits: m.hits,
    rate: m.evaluated ? m.hits / m.evaluated : null,
  });
  // 关系档固定顺序展示(direct 在前,情绪/弱/未覆盖殿后),只返回有样本的
  const REL_ORDER = ["direct", "indirect", "sentiment", "weak", "candidate", "trigger", "unmapped"];
  const byRelation = REL_ORDER.filter((rt) => relAgg.has(rt)).map((rt) => ({
    relationType: rt,
    stats: toStats(relAgg.get(rt)!),
  }));
  const byChain = Array.from(chainAgg.entries())
    .map(([chainId, m]) => ({ chainId, stats: toStats(m) }))
    .sort((a, b) => b.stats.evaluated - a.stats.evaluated);
  return { byRelation, byChain };
}

// 样本低于此数不亮总命中率,只说"样本积累中"。三轮 review T10:与 linkage-rules §6 红线
// 统一为 12(单一来源=lib/linkage.ts 的 MIN_SAMPLE),同页不再出现 5/10/12 三种口径。
export { MIN_SAMPLE } from "@/lib/linkage";

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
