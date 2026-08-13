// Market Intent 快照存取(2.2.2)。表 market_intent_daily:PK(ymd,segment),data=metrics+intent。
// 每日快照是 Track 回看与 Chain Timeline(2.2.4)的数据地基——「07-08 判断吸筹,后来发生了什么」
// 全靠这张表按日留痕。DDL 见 db-ddl.ts(与 instrumentation 哨兵相邻改)。
import { Prisma } from "@prisma/client";
import { getPrisma } from "@/lib/prisma";
import type { SegmentDayMetrics, SegmentIntentSnapshot } from "./types";

export async function saveSnapshots(snaps: SegmentIntentSnapshot[]): Promise<void> {
  const db = getPrisma();
  if (!db || snaps.length === 0) return;
  for (const s of snaps) {
    const data = { metrics: s.metrics, intent: s.intent } as unknown as Prisma.InputJsonValue;
    await db.marketIntentDaily.upsert({
      where: { ymd_segment: { ymd: s.ymd, segment: s.segment } },
      create: { ymd: s.ymd, segment: s.segment, data },
      update: { data },
    });
  }
}

// 已有快照的 ymd 集合(近 lookback 个自然日窗口内)——cron 用来找缺口做有界回补。
export async function storedYmdSet(sinceYmd: string): Promise<Set<string>> {
  const db = getPrisma();
  if (!db) return new Set();
  const rows = await db.marketIntentDaily.findMany({
    where: { ymd: { gte: sinceYmd } },
    select: { ymd: true },
    distinct: ["ymd"],
  });
  return new Set(rows.map((r) => r.ymd));
}

// 各板块历史 metrics(ymd 升序,不含 beforeYmd 当日)——指标构建的趋势输入。
export async function loadHistory(
  beforeYmd: string,
  limitDays = 30
): Promise<Map<string, SegmentDayMetrics[]>> {
  const out = new Map<string, SegmentDayMetrics[]>();
  const db = getPrisma();
  if (!db) return out;
  const rows = await db.marketIntentDaily.findMany({
    where: { ymd: { lt: beforeYmd } },
    orderBy: { ymd: "desc" },
    take: limitDays * 16, // 8 板块 × 冗余,再按板块裁
  });
  for (const r of rows.reverse()) {
    const data = r.data as unknown as { metrics?: SegmentDayMetrics };
    if (!data?.metrics) continue;
    const arr = out.get(r.segment) ?? [];
    arr.push(data.metrics);
    out.set(r.segment, arr);
  }
  for (const k of Array.from(out.keys())) out.set(k, out.get(k)!.slice(-limitDays));
  return out;
}

// 某交易日全部板块快照(2.2.3 UI / Track 用)。
export async function snapshotsByYmd(ymd: string): Promise<SegmentIntentSnapshot[]> {
  const db = getPrisma();
  if (!db) return [];
  const rows = await db.marketIntentDaily.findMany({ where: { ymd } });
  return rows
    .map((r) => {
      const data = r.data as unknown as Omit<SegmentIntentSnapshot, "ymd" | "segment">;
      return data?.metrics && data?.intent
        ? { ymd: r.ymd, segment: r.segment, metrics: data.metrics, intent: data.intent }
        : null;
    })
    .filter((x): x is SegmentIntentSnapshot => x !== null);
}

// 最近一个有快照的交易日 + 其全部板块快照。
export async function latestSnapshots(): Promise<{ ymd: string; snaps: SegmentIntentSnapshot[] } | null> {
  const db = getPrisma();
  if (!db) return null;
  const last = await db.marketIntentDaily.findFirst({ orderBy: { ymd: "desc" }, select: { ymd: true } });
  if (!last) return null;
  return { ymd: last.ymd, snaps: await snapshotsByYmd(last.ymd) };
}
