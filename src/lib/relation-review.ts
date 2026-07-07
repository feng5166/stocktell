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

// 入队/累计:同 (code, chainId) 幂等。二轮 review N8:hitCount 只在【证据变化】时 +1——
// feeder 每天对同一 30 天滚动窗重扫,零新判定也无脑 +1 的话,计数器度量的是"cron 跑了几天"
// 而非证据量,审阅人会按噪声排优先级。同日重跑恒幂等;reason(内嵌判定/验证数)没变=只刷
// lastSeen 不加计数。已被人工 rejected 的不复活;不再逐条开事务(小项③:唯一约束竞态由
// create 的冲突 catch 兜住,15:30 cron 不为它烧 N×4 次往返)。
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
  try {
    const existing = await db.relationReview.findUnique({
      where: { code_chainId: { code: item.code, chainId: item.chainId } },
    });
    if (!existing) {
      await db.relationReview
        .create({
          data: {
            code: item.code,
            chainId: item.chainId,
            suggestedType: item.suggestedType ?? null,
            reason: item.reason ?? null,
            source: item.source,
            firstSeen: item.date,
            lastSeen: item.date,
          },
        })
        .catch(() => {}); // 并发下的唯一冲突:另一路已建,视作已入队
      return;
    }
    if (existing.status === "rejected") return; // 人工已拒,不复活
    // 三轮 review T8:幂等守卫按【同日同源】——feeder(15:30)当天摸过的条目,真实用户当天
    // 在 Watchlist 提交复核仍要落下去(那是独立的新证据),不能静默 no-op 却回 ok。
    if (existing.lastSeen === item.date && existing.source === item.source) return;
    // 三轮 review T2:跨源【绝不覆盖 reason】——feeder 的统计证据("近30天复盘:N 次判定…")
    // 是审阅优先级的依据,不能被(无鉴权面可达的)manual 提交改写;跨源新证据以标记段追加一次,
    // 已有同源标记则只刷 lastSeen(重复提交不再膨胀)。同源 reason 变化仍视为证据更新。
    const crossSource = existing.source !== item.source;
    const crossTag = `[${item.source}]`;
    let reasonUpdate: string | undefined;
    let countIt = false;
    if (crossSource) {
      if (item.reason && !(existing.reason ?? "").includes(crossTag)) {
        reasonUpdate = `${existing.reason ?? ""}${existing.reason ? " | " : ""}${crossTag} ${item.reason}`.slice(0, 600);
        countIt = true; // 首次跨源证据,计一次
      }
    } else if (item.reason && item.reason !== existing.reason) {
      reasonUpdate = item.reason;
      countIt = true;
    }
    await db.relationReview.update({
      where: { id: existing.id },
      data: {
        lastSeen: item.date,
        ...(countIt ? { hitCount: { increment: 1 } } : {}),
        ...(reasonUpdate !== undefined ? { reason: reasonUpdate } : {}),
        ...(item.suggestedType ? { suggestedType: item.suggestedType } : {}),
      },
    });
  } catch {
    /* 队列坏了不连累调用方 */
  }
}

// 带「读失败」区分的列表(三轮 review S6):admin 审阅台不能把"读挂了"渲染成"队列为空"。
export async function listReviewQueueChecked(
  status?: ReviewStatus
): Promise<{ items: RelationReviewRow[]; readFailed: boolean }> {
  const db = getPrisma();
  if (!db) return { items: [], readFailed: false };
  try {
    const rows = await db.relationReview.findMany({
      where: status ? { status } : undefined,
      orderBy: [{ lastSeen: "desc" }, { hitCount: "desc" }],
      take: 200,
    });
    return { items: rows as unknown as RelationReviewRow[], readFailed: false };
  } catch {
    return { items: [], readFailed: true };
  }
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
// note 语义(N7):undefined=不动,空串=清空(存 null)。
export async function setReviewStatus(
  id: string,
  status: ReviewStatus,
  note?: string
): Promise<boolean> {
  const db = getPrisma();
  if (!db) return false;
  const r = await db.relationReview
    .update({
      where: { id },
      data: { status, ...(note !== undefined ? { note: note === "" ? null : note } : {}) },
    })
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
// 二轮 review N9:只喂 direct/indirect——sentiment/weak/candidate 低同向率是【设计预期】
// (情绪衰减/外围观察),入队会霸榜把真正要复核的 direct 淹没,且与 /track 页"直接映射
// 高频未验证进入审阅队列"的产品承诺相悖。
const REVIEW_FEED_TYPES = new Set(["direct", "indirect"]);

export async function feedReviewQueueFromOutcomes(
  date: string,
  opts: { lookbackDays?: number; minJudged?: number; maxRate?: number } = {}
): Promise<{ queued: number; scanned: number }> {
  const db = getPrisma();
  if (!db) return { queued: 0, scanned: 0 };
  const lookbackDays = opts.lookbackDays ?? 30;
  const minJudged = opts.minJudged ?? 6;
  const maxRate = opts.maxRate ?? 0.25;
  // 小项①:窗口按【日期字符串】直减,不经 toISOString——北京 T00:00 转 UTC 会回退一天,
  // 30 天窗实际 31 天,与 reason 文案对不上。用 UTC 正午锚点做日历减法,时区中立。
  const since = new Date(new Date(`${date}T12:00:00Z`).getTime() - lookbackDays * 86400_000)
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
    if (!REVIEW_FEED_TYPES.has(rel.relationType)) continue; // N9:低档低同向=预期,不进队
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
