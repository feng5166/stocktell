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
export function heatSignature(payload: DailyInsightPayload): string {
  return payload.heat
    .slice()
    .sort((a, b) => a.segment.localeCompare(b.segment))
    .map((h) => `${h.segment}:${h.direction}`)
    .join("|");
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
  const rows = await db.insightDoc.findMany({
    where: { chainId, kind: "daily", date: { lt: beforeDate }, status: { in: ["published", "draft"] } },
    orderBy: { date: "desc" },
    take: n,
  });
  return rows.map((r) => heatSignature(r.payload as unknown as DailyInsightPayload));
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
  const [, row] = await db.$transaction([
    db.insightDoc.updateMany({
      where: {
        chainId: doc.chainId,
        date: doc.date,
        kind: doc.kind,
        status: "published",
        id: { not: id },
      },
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
