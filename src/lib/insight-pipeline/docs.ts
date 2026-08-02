// insight 管线 · insight_docs 读写(PRD §4.1/§5 + 增补#2 superseded)。
// 不变量:同 (chainId, date, kind) 任意时刻至多一个 published——publishDoc 在事务里
// 把同组其它 published 置 superseded。页面读取只认 published。
import { getPrisma } from "@/lib/prisma";
import type { Prisma } from "@prisma/client";
import type { GuardResult } from "./guard";
import type { DailyInsightPayload } from "./schema";

export interface InsightDocRow {
  id: string;
  slug: string;
  chainId: string;
  date: string;
  kind: string;
  status: string;
  payload: DailyInsightPayload;
  guard: GuardResult | null;
  reviewNote: string | null;
  reviewedAt: Date | null;
  publishedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

/* eslint-disable @typescript-eslint/no-explicit-any */
const fromRow = (r: any): InsightDocRow => ({
  ...r,
  payload: r.payload as DailyInsightPayload,
  guard: (r.guard ?? null) as GuardResult | null,
});
/* eslint-enable @typescript-eslint/no-explicit-any */

export const dailySlug = (chainId: string, date: string) => `daily-${chainId}-${date}`;

// 热力方向指纹(同图谱检测用):环节按名排序后拼 方向,稳定可比。
// 同图谱指纹(2026-07-14 负责人拍板细化:方向+强度)。此前只看环节方向,4 环节粗档链
// 在趋势周里"连 3 天同向"频繁误触发暂停(07-14 首例实战:实为 AI 链连涨的真实行情)。
// 强度用当日触发构成(事件总数档+大级别事件档)——存量 payload 就有,确定性重算,历史兼容;
// 语义升级为「方向相同【且】触发构成相同」连续 3 天才算嫌疑,方向同但行情构成不同=真实市场。
export function heatSignature(payload: DailyInsightPayload): string {
  const dirs = payload.heat
    .slice()
    .sort((a, b) => a.segment.localeCompare(b.segment))
    .map((h) => `${h.segment}:${h.direction}`)
    .join("|");
  const events = payload.trigger?.events ?? [];
  const total = events.length;
  const big = events.filter((e) => e.magnitude === "大").length;
  const up = events.filter((e) => e.direction === "up").length;
  const bucket = (n: number) => (n === 0 ? 0 : n <= 2 ? 1 : n <= 4 ? 2 : 3);
  return `${dirs}@${bucket(total)}-${bucket(big)}-${bucket(up)}`;
}

// 最近 n 天(不含 beforeDate 当天)该链 daily 的热力指纹,最新在前。
// 只看 published/draft(rejected/superseded 不算历史轨迹)。
export async function getRecentHeatSignatures(
  chainId: string,
  beforeDate: string,
  n: number
): Promise<string[]> {
  const db = getPrisma();
  if (!db) return [];
  // 按「日」去重(#8):同一天可能有多个修订(-r2/-r3),不能当作多天比对,否则同图谱
  // 检测会拿同日修订当"连续天"误触暂停。多取一些行,按 date 取每天最新一条,再取前 n 天。
  const rows = await db.insightDoc.findMany({
    where: { chainId, kind: "daily", date: { lt: beforeDate }, status: { in: ["published", "draft"] } },
    orderBy: [{ date: "desc" }, { createdAt: "desc" }],
    take: n * 4,
  });
  const seenDate = new Set<string>();
  const perDay: DailyInsightPayload[] = [];
  for (const r of rows) {
    if (seenDate.has(r.date)) continue;
    seenDate.add(r.date);
    perDay.push(r.payload as unknown as DailyInsightPayload);
    if (perDay.length >= n) break;
  }
  return perDay.map(heatSignature);
}

/* ---------- 管线暂停开关(同图谱连续告警未处理→自动暂停,§7.2-6) ---------- */
// 复用 morning_brief_cache 当 KV;key=insight-paused:{chainId},value=暂停原因。
const pauseKey = (chainId: string) => `insight-paused:${chainId}`;

export async function isPipelinePaused(chainId: string): Promise<string | null> {
  const db = getPrisma();
  if (!db) return null;
  const row = await db.morningBriefCache.findUnique({ where: { key: pauseKey(chainId) } }).catch(() => null);
  return row?.brief ?? null;
}
export async function pausePipeline(chainId: string, reason: string): Promise<void> {
  const db = getPrisma();
  if (!db) return;
  await db.morningBriefCache
    .upsert({ where: { key: pauseKey(chainId) }, create: { key: pauseKey(chainId), brief: reason }, update: { brief: reason, updatedAt: new Date() } })
    .catch(() => {});
}
export async function resumePipeline(chainId: string): Promise<void> {
  const db = getPrisma();
  if (!db) return;
  await db.morningBriefCache.delete({ where: { key: pauseKey(chainId) } }).catch(() => {});
}

// 当日该链是否已有 daily(draft/published 任一)——cron 幂等判断用(rejected/superseded 不算)
export async function hasDaily(chainId: string, date: string): Promise<boolean> {
  const db = getPrisma();
  if (!db) return false;
  const n = await db.insightDoc.count({
    where: { chainId, date, kind: "daily", status: { in: ["draft", "published"] } },
  });
  return n > 0;
}

// 存草稿。基础 slug 空闲(或本身是 draft/rejected)则占用;已被 published 占用 → 追加修订号
// (PRD §5:已发布保持在线,新草稿共存,人审决定是否替换发布)。
export async function saveDraft(
  payload: DailyInsightPayload,
  guard: GuardResult
): Promise<InsightDocRow | null> {
  const db = getPrisma();
  if (!db) return null;
  const base = dailySlug(payload.chainId, payload.date);
  const existing = await db.insightDoc.findUnique({ where: { slug: base } });
  let slug = base;
  if (existing && existing.status === "published") {
    const n = await db.insightDoc.count({
      where: { chainId: payload.chainId, date: payload.date, kind: "daily" },
    });
    slug = `${base}-r${n + 1}`;
  }
  const data = {
    chainId: payload.chainId,
    date: payload.date,
    kind: "daily",
    status: "draft",
    payload: payload as unknown as Prisma.InputJsonValue,
    guard: guard as unknown as Prisma.InputJsonValue,
  };
  const row = await db.insightDoc.upsert({
    where: { slug },
    create: { slug, ...data },
    update: { ...data, reviewNote: null, reviewedAt: null, publishedAt: null },
  });
  return fromRow(row);
}

// 发布:本篇 → published,同组其它 published → superseded(事务,保不变量)
export async function publishDoc(id: string): Promise<InsightDocRow | null> {
  const db = getPrisma();
  if (!db) return null;
  const doc = await db.insightDoc.findUnique({ where: { id } });
  if (!doc) return null;
  // #7:只有 draft / published(重新发布)可发;rejected / superseded 不能经发布复活。
  if (doc.status !== "draft" && doc.status !== "published") return null;
  // 收敛口径按 kind 分:daily=同 (chainId,date) 至多一个 published(修订稿互斥);
  // event=同 slug 至多一个(同链同日可并存多篇不同触发标的的专篇,不得互相 superseded)。
  // slug unique 使 event 的 updateMany 恒空,但保留语义清晰的分支防未来 slug 规则变化。
  const supersedeWhere =
    doc.kind === "event"
      ? { slug: doc.slug, status: "published", id: { not: id } }
      : { chainId: doc.chainId, date: doc.date, kind: doc.kind, status: "published", id: { not: id } };
  const [, row] = await db.$transaction([
    db.insightDoc.updateMany({
      where: supersedeWhere,
      data: { status: "superseded" },
    }),
    db.insightDoc.update({
      where: { id },
      data: { status: "published", publishedAt: new Date(), reviewedAt: new Date() },
    }),
  ]);
  return fromRow(row);
}

export async function rejectDoc(id: string, note: string): Promise<void> {
  const db = getPrisma();
  if (!db) return;
  await db.insightDoc.update({
    where: { id },
    data: { status: "rejected", reviewNote: note, reviewedAt: new Date() },
  });
}

// 页面消费:当日 published daily(同组唯一;防御性取最新 publishedAt)
export async function getPublishedDaily(
  chainId: string,
  date: string
): Promise<InsightDocRow | null> {
  const db = getPrisma();
  if (!db) return null;
  const row = await db.insightDoc.findFirst({
    where: { chainId, date, kind: "daily", status: "published" },
    orderBy: { publishedAt: "desc" },
  });
  return row ? fromRow(row) : null;
}

// 归档(2.1-W4):某链已发布 daily 的日期列表(倒序),供 /insight/[slug]/[date] 归档页与 sitemap。
export async function listPublishedDailyDates(chainId: string, limit = 120): Promise<string[]> {
  const db = getPrisma();
  if (!db) return [];
  const rows = await db.insightDoc
    .findMany({
      where: { chainId, kind: "daily", status: "published" },
      select: { date: true },
      orderBy: { date: "desc" },
      take: limit,
    })
    .catch(() => [] as Array<{ date: string }>);
  return Array.from(new Set(rows.map((r) => r.date)));
}

/* ---------- 事件专篇(M2,PRD prd-2.3-iteration-review §2) ---------- */
// slug 由 event.ts 规则生成(evt-{date}-{code} / evt-{date}-res-{chainId}),同 slug 幂等。
// 全审轨:只存 draft,发布走 admin publishDoc(同 (chainId,date,kind) 至多一个 published
// 的不变量对 kind=event 同样成立——publishDoc 按 doc.kind 收敛)。

// 当日该 slug 是否已有稿(draft/published)——cron 幂等判断(rejected 不算:打回后次日不复活,
// 但同日重跑也不该重建被打回的稿,故 rejected 也算「已处理过」)
export async function hasEventDoc(slug: string): Promise<boolean> {
  const db = getPrisma();
  if (!db) return false;
  const n = await db.insightDoc.count({
    where: { slug, status: { in: ["draft", "published", "rejected"] } },
  });
  return n > 0;
}

export async function saveEventDraft(
  slug: string,
  payload: DailyInsightPayload,
  guard: GuardResult
): Promise<InsightDocRow | null> {
  const db = getPrisma();
  if (!db) return null;
  const data = {
    chainId: payload.chainId,
    date: payload.date,
    kind: "event",
    status: "draft",
    payload: payload as unknown as Prisma.InputJsonValue,
    guard: guard as unknown as Prisma.InputJsonValue,
  };
  const row = await db.insightDoc.upsert({
    where: { slug },
    create: { slug, ...data },
    update: { ...data, reviewNote: null, reviewedAt: null, publishedAt: null },
  });
  return fromRow(row);
}

// 页面消费:按 slug 取已发布事件专篇
export async function getPublishedEventBySlug(slug: string): Promise<InsightDocRow | null> {
  const db = getPrisma();
  if (!db) return null;
  const row = await db.insightDoc.findFirst({ where: { slug, kind: "event", status: "published" } });
  return row ? fromRow(row) : null;
}

// 列表:已发布事件专篇(链页「事件专篇」区 / 首页入口 map / sitemap)。
// date 精确取当日;chainId 取该链最近 N 篇。
export async function listPublishedEvents(opts?: {
  chainId?: string;
  date?: string;
  limit?: number;
}): Promise<InsightDocRow[]> {
  const db = getPrisma();
  if (!db) return [];
  const rows = await db.insightDoc
    .findMany({
      where: {
        kind: "event",
        status: "published",
        ...(opts?.chainId ? { chainId: opts.chainId } : {}),
        ...(opts?.date ? { date: opts.date } : {}),
      },
      orderBy: [{ date: "desc" }, { publishedAt: "desc" }],
      take: opts?.limit ?? 20,
    })
    .catch(() => [] as unknown[]);
  return (rows as unknown[]).map(fromRow);
}

// 分级审核(2.3 P2-1):找出 payload 里「历史上从未发布过、也不在静态核定集」的映射标的。
// 基线 = 该链近 60 篇已发布 daily 的映射 code ∪ 静态 InsightChain.mappings 的 code。
// 真正的新面孔才留审(合规风险集中在新映射);方向变化/老面孔照常走自动发布轨。
export async function findUnseenMappingCodes(
  chainId: string,
  insightSlug: string | undefined,
  codes: string[]
): Promise<string[]> {
  if (codes.length === 0) return [];
  const db = getPrisma();
  if (!db) return [];
  const seen = new Set<string>();
  // 静态核定集(人工审过的映射)
  const { INSIGHT_CHAINS } = await import("@/data/insight-chains");
  const chain = insightSlug ? INSIGHT_CHAINS[insightSlug] : undefined;
  for (const m of chain?.mappings ?? []) if (m.code) seen.add(m.code);
  // 历史已发布 daily 的映射(发布=当时已过审核轨)
  const rows = await db.insightDoc
    .findMany({
      where: { chainId, kind: "daily", status: "published" },
      select: { payload: true },
      orderBy: { date: "desc" },
      take: 60,
    })
    .catch(() => [] as Array<{ payload: unknown }>);
  for (const r of rows) {
    const p = r.payload as DailyInsightPayload;
    for (const m of p.mappingsDelta ?? []) seen.add(m.code);
  }
  return codes.filter((c) => !seen.has(c));
}

// 昨日 heat(S2 diff 输入):最近一篇该链 daily(published 优先,其次 draft)
export async function getPrevHeat(
  chainId: string,
  beforeDate: string
): Promise<{ segment: string; direction: string }[] | null> {
  const db = getPrisma();
  if (!db) return null;
  const row = await db.insightDoc.findFirst({
    where: { chainId, kind: "daily", date: { lt: beforeDate }, status: { in: ["published", "draft"] } },
    orderBy: { date: "desc" },
  });
  if (!row) return null;
  const p = row.payload as unknown as DailyInsightPayload;
  return p.heat?.map((h) => ({ segment: h.segment, direction: h.direction })) ?? null;
}

// 审核页列表
export async function listDocs(opts?: {
  status?: string;
  limit?: number;
}): Promise<InsightDocRow[]> {
  const db = getPrisma();
  if (!db) return [];
  const rows = await db.insightDoc.findMany({
    where: opts?.status ? { status: opts.status } : undefined,
    orderBy: [{ date: "desc" }, { createdAt: "desc" }],
    take: opts?.limit ?? 30,
  });
  return rows.map(fromRow);
}

export async function getDoc(id: string): Promise<InsightDocRow | null> {
  const db = getPrisma();
  if (!db) return null;
  const row = await db.insightDoc.findUnique({ where: { id } });
  return row ? fromRow(row) : null;
}

export async function updatePayload(
  id: string,
  payload: DailyInsightPayload
): Promise<void> {
  const db = getPrisma();
  if (!db) return;
  await db.insightDoc.update({
    where: { id },
    data: { payload: payload as unknown as Prisma.InputJsonValue },
  });
}
