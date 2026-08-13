// Chain Timeline v1(2.2.4):纯聚合现成数据,零新表零 LLM——把一条链的
// 事件触发 → 资金意图变化 → 事件专篇 → 复盘判定 按日串成「逻辑生命周期」视图。
// 负责人拍板:用户最终看的是一条投资逻辑的生命周期,不是又一个静态页面。
// 数据源:briefing_items(事件)/ market_intent_daily(意图转变)/ insight_docs evt(专篇)/
// briefing_outcomes(复盘,历史同向口径)。全部只读聚合,任一源失败该类目静默缺席不炸页。
import { getPrisma } from "@/lib/prisma";
import { recentSnapshots } from "@/lib/market-intent/store";
import { SEGMENT_BY_KEY } from "@/lib/market-intent/segments";
import { resolvePrimary, resolveInChain } from "@/lib/relation-resolver";
import { CONFIDENCE_LABEL } from "@/lib/market-intent/ui";

export interface ChainTimelineEntry {
  date: string; // YYYY-MM-DD
  kind: "event" | "evt-doc" | "intent" | "outcome";
  text: string;
  href?: string;
}

const ymdToISO = (ymd: string) => `${ymd.slice(0, 4)}-${ymd.slice(4, 6)}-${ymd.slice(6, 8)}`;

// 意图转变条目:每板块按日排序,首次出现非中性 =「出现 X」,档位变化 =「转为 X」。
function intentEntries(
  snaps: Awaited<ReturnType<typeof recentSnapshots>>,
  insightSlugs: Set<string>
): ChainTimelineEntry[] {
  const bySeg = new Map<string, typeof snaps>();
  for (const s of snaps) {
    const seg = SEGMENT_BY_KEY[s.segment];
    if (!seg || !seg.chainSlugs.some((sl) => insightSlugs.has(sl))) continue;
    const arr = bySeg.get(s.segment) ?? [];
    arr.push(s);
    bySeg.set(s.segment, arr);
  }
  const out: ChainTimelineEntry[] = [];
  for (const arr of Array.from(bySeg.values())) {
    arr.sort((a, b) => a.ymd.localeCompare(b.ymd));
    let prev: string | null = null;
    for (const s of arr) {
      const name = SEGMENT_BY_KEY[s.segment]?.name ?? s.segment;
      const cur = s.intent.intent;
      if (prev === null) {
        if (cur !== "neutral")
          out.push({
            date: ymdToISO(s.ymd),
            kind: "intent",
            text: `${name} 资金出现${s.intent.label}(${CONFIDENCE_LABEL[s.intent.confidence]})`,
          });
      } else if (cur !== prev) {
        out.push({
          date: ymdToISO(s.ymd),
          kind: "intent",
          text:
            cur === "neutral"
              ? `${name} 资金意图回落中性`
              : `${name} 资金转为${s.intent.label}(${CONFIDENCE_LABEL[s.intent.confidence]})`,
        });
      }
      prev = cur;
    }
  }
  return out;
}

export async function buildChainTimeline(opts: {
  chainId: string; // chain-relations 的 chainId(resolver 口径,如 ai-infra / data-center-power)
  insightSlugs: string[]; // 关联 insight 链 slug(意图板块归属口径)
  evtDocs?: { date: string; slug: string; title: string }[]; // 链页已取的事件专篇,避免重复查询
  days?: number;
}): Promise<ChainTimelineEntry[]> {
  const days = opts.days ?? 20;
  const slugSet = new Set(opts.insightSlugs);
  const snaps = await recentSnapshots(days).catch(() => []);
  const entries: ChainTimelineEntry[] = intentEntries(snaps, slugSet);

  // 窗口下界:意图快照最早日;没有快照时退 30 自然日
  const cutoff = snaps.length
    ? ymdToISO(snaps.map((s) => s.ymd).sort()[0])
    : new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10);

  const db = getPrisma();
  if (db) {
    // 事件触发(已发布简报,链归属=触发源主链或映射标的在链内;每日至多 2 条防刷屏)
    const items = await db.briefingItem
      .findMany({
        where: { date: { gte: cutoff }, status: "published" },
        orderBy: { date: "asc" },
        select: { date: true, title: true, triggerCode: true, beneficiaries: true },
      })
      .catch(() => []);
    const perDay = new Map<string, number>();
    for (const it of items) {
      const benes = (it.beneficiaries as { code?: string }[] | null) ?? [];
      const own =
        (it.triggerCode && resolvePrimary(it.triggerCode)?.chainId === opts.chainId) ||
        benes.some((b) => b.code && resolveInChain(b.code, opts.chainId));
      if (!own) continue;
      const n = perDay.get(it.date) ?? 0;
      if (n >= 2) continue;
      perDay.set(it.date, n + 1);
      entries.push({ date: it.date, kind: "event", text: `事件触发:${it.title}` });
    }

    // 复盘判定(实盘,历史同向口径;按日聚合一行)
    const outs = await db.briefingOutcome
      .findMany({
        where: { date: { gte: cutoff }, isBacktest: false, hit: { not: null } },
        select: { date: true, code: true, hit: true },
      })
      .catch(() => []);
    const byDate = new Map<string, { total: number; hit: number }>();
    for (const o of outs) {
      if (!resolveInChain(o.code, opts.chainId)) continue;
      const agg = byDate.get(o.date) ?? { total: 0, hit: 0 };
      agg.total++;
      if (o.hit) agg.hit++;
      byDate.set(o.date, agg);
    }
    for (const [date, agg] of Array.from(byDate.entries())) {
      entries.push({
        date,
        kind: "outcome",
        text: `复盘:${agg.total} 条映射判定,${agg.hit} 条历史同向`,
        href: "/track",
      });
    }
  }

  // 事件专篇(完整传导拆解,由链页传入)
  for (const d of opts.evtDocs ?? []) {
    if (d.date >= cutoff)
      entries.push({
        date: d.date,
        kind: "evt-doc",
        text: `事件专篇:${d.title}`,
        href: `/insight/evt/${d.slug}`,
      });
  }

  // 按日升序;同日内 事件 → 专篇 → 意图 → 复盘(事件因、资金果、复盘尾)
  const KIND_ORDER: Record<ChainTimelineEntry["kind"], number> = {
    event: 0,
    "evt-doc": 1,
    intent: 2,
    outcome: 3,
  };
  return entries
    .sort((a, b) => a.date.localeCompare(b.date) || KIND_ORDER[a.kind] - KIND_ORDER[b.kind])
    .slice(-40); // 上限保护:老条目裁掉,近端优先
}
