// 层③ relationReviewQueue 持久化(2.1-W3,2026-07-07 拍板)。
// 队列的唯一职责=「把待人工复核的关系沉淀下来」:
// - 写入端:复盘(outcome-review)/每日信号多次命中(daily-signal,层②真源接入后)/人工(manual)
// - 消费端:admin/relation-review 审阅台(pending 列表 + confirm/reject)
//
// 不变量(必须长期守住):
// - #4 复盘/同向统计【绝不】自动改 relationType——confirmed 只是人工结论记录,
//   改档仍走 chain-relations.ts 代码评审(diff 可审计);
// - #5 note 只用于审计,不作前台 reason 展示;
// - 队列不影响 resolver 解析(pending 不是关系,resolver 层③ getter 维持骨架直到
//   有「confirmed 候选影响展示」的产品决策——目前没有)。
//
// 所有写读 fail-safe:队列坏了不能连累记账/复盘主流程。
import { getPrisma } from "@/lib/prisma";
import type { RelationType } from "@/data/chain-relations";

export type ReviewSource = "outcome-review" | "daily-signal" | "manual";
export type ReviewStatus = "pending" | "confirmed" | "rejected";

export type RelationReviewRow = {
  id: string;
  code: string;
  chainId: string;
  suggestedType: RelationType | null;
  reason: string | null;
  source: ReviewSource;
  hitCount: number;
  firstSeen: string;
  lastSeen: string;
  status: ReviewStatus;
  note: string | null;
};

// 入队/累计:同 (code, chainId) 幂等——已存在则 hitCount+1、刷 lastSeen/reason。
// 已被人工 rejected 的不复活(人已拒,重复入队=骚扰);confirmed 的只刷计数供审计。
export async function upsertReviewItem(item: {
  code: string;
  chainId: string;
  date: string; // 触发日 YYYY-MM-DD
  source: ReviewSource;
  reason?: string;
  suggestedType?: RelationType;
}): Promise<void> {
  const db = getPrisma();
  if (!db) return;
  await db
    .$transaction(async (tx) => {
      const existing = await tx.relationReview.findUnique({
        where: { code_chainId: { code: item.code, chainId: item.chainId } },
      });
      if (!existing) {
        await tx.relationReview.create({
          data: {
            code: item.code,
            chainId: item.chainId,
            suggestedType: item.suggestedType ?? null,
            reason: item.reason ?? null,
            source: item.source,
            firstSeen: item.date,
            lastSeen: item.date,
          },
        });
        return;
      }
      if (existing.status === "rejected") return; // 人工已拒,不复活
      await tx.relationReview.update({
        where: { id: existing.id },
        data: {
          hitCount: { increment: 1 },
          lastSeen: item.date,
          ...(item.reason ? { reason: item.reason } : {}),
          ...(item.suggestedType ? { suggestedType: item.suggestedType } : {}),
        },
      });
    })
    .catch(() => {});
}

export async function listReviewQueue(status?: ReviewStatus): Promise<RelationReviewRow[]> {
  const db = getPrisma();
  if (!db) return [];
  const rows = await db.relationReview
    .findMany({
      where: status ? { status } : undefined,
      orderBy: [{ lastSeen: "desc" }, { hitCount: "desc" }],
      take: 200,
    })
    .catch(() => []);
  return rows as unknown as RelationReviewRow[];
}

// 人工审阅动作(admin):只改队列状态与备注,不碰 staticRelations(不变量#4)。
export async function setReviewStatus(
  id: string,
  status: ReviewStatus,
  note?: string
): Promise<boolean> {
  const db = getPrisma();
  if (!db) return false;
  const r = await db.relationReview
    .update({ where: { id }, data: { status, ...(note !== undefined ? { note } : {}) } })
    .catch(() => null);
  return !!r;
}

// 诊断用:pending 数(resolver-health 面板)。
export async function countPendingReview(): Promise<number> {
  const db = getPrisma();
  if (!db) return 0;
  return db.relationReview.count({ where: { status: "pending" } }).catch(() => 0);
}

// 复盘 → 队列(2.1-W3b):把「高频未验证」的关系推给人工复核。
// 口径:只看实盘(isBacktest=false)、近 lookback 个自然日、已判定(hit 非 null)样本;
// 某 (code) 判定数 ≥ minJudged 且验证率 < maxRate → 入队(带链身份与统计上下文)。
// 阈值保守起步(≥6 次判定、验证率 <25%),宁少勿滥——队列刷屏=没人看。
export async function feedReviewQueueFromOutcomes(
  date: string,
  opts: { lookbackDays?: number; minJudged?: number; maxRate?: number } = {}
): Promise<{ queued: number; scanned: number }> {
  const db = getPrisma();
  if (!db) return { queued: 0, scanned: 0 };
  const lookbackDays = opts.lookbackDays ?? 30;
  const minJudged = opts.minJudged ?? 6;
  const maxRate = opts.maxRate ?? 0.25;
  const since = new Date(new Date(`${date}T00:00:00+08:00`).getTime() - lookbackDays * 86400_000)
    .toISOString()
    .slice(0, 10);
  const rows = await db.briefingOutcome
    .findMany({
      where: { isBacktest: false, date: { gte: since }, hit: { not: null } },
      select: { code: true, hit: true },
    })
    .catch(() => []);
  const byCode = new Map<string, { judged: number; hits: number }>();
  for (const r of rows) {
    const m = byCode.get(r.code) ?? { judged: 0, hits: 0 };
    m.judged++;
    if (r.hit) m.hits++;
    byCode.set(r.code, m);
  }
  // 链身份在这里(而非查询层)解析:resolver 是唯一入口,且 outcome 表本就不落 chainId
  const { resolvePrimary } = await import("@/lib/relation-resolver");
  let queued = 0;
  for (const [code, m] of Array.from(byCode.entries())) {
    if (m.judged < minJudged || m.hits / m.judged >= maxRate) continue;
    const rel = resolvePrimary(code);
    if (!rel) continue; // 无静态关系的票不进关系队列(它没有档可复核)
    await upsertReviewItem({
      code,
      chainId: rel.chainId,
      date,
      source: "outcome-review",
      reason: `近${lookbackDays}天复盘:${m.judged} 次判定仅 ${m.hits} 次验证成立(现档 ${rel.relationType}),建议人工复核`,
    });
    queued++;
  }
  return { queued, scanned: byCode.size };
}
