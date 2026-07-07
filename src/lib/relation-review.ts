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
import { alertThrottled } from "@/lib/monitor";
import type { RelationType } from "@/data/chain-relations";

export type ReviewSource = "outcome-review" | "daily-signal" | "manual" | "ai-review";
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

// 入队/累计(四轮 review V1 重设计:【按源分账】)。
// 唯一键 = (code, chainId, source):同一关系的 feeder 统计、用户提交、AI 建议各自一行,
// 幂等/hitCount/reason 全部行内自洽——此前"单行 + 字符串拼接 + 共享 lastSeen"被执行级测试
// 证出三个洞(手动提交冻结 feeder 当日更新 / 拼接段被整体替换后计数虚增 / manual-first 行
// feeder 统计永不刷新),补丁摞了三轮,按源分行让这类跨源干扰在结构上不可能。
// 行内规则:同日重复=no-op;reason(=该源证据)变化才 hitCount+1 并整体替换;
// rejected 不复活。审阅台按 (code,chainId) 自然看到多源并排,证据来源一目了然。
export async function upsertReviewItem(item: {
  code: string;
  chainId: string;
  date: string; // 触发日 YYYY-MM-DD
  source: ReviewSource;
  reason?: string;
  suggestedType?: RelationType | null; // null=显式清空(如 AI 建议 remove,W4)
}): Promise<void> {
  const db = getPrisma();
  if (!db) return;
  try {
    const existing = await db.relationReview.findUnique({
      where: {
        code_chainId_source: { code: item.code, chainId: item.chainId, source: item.source },
      },
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
        .catch(async (e) => {
          // W1(五轮 review):静默吞错曾掩盖"生产索引未迁移"整类故障(UI 显示成功、实际没写)。
          // 并发真冲突极罕见(先 findUnique 再 create,竞窗小),失败一律可见+节流告警。
          console.error("[relation-review] 入队写入失败:", item.code, item.chainId, item.source, e);
          await alertThrottled(
            "relation-review-create-fail",
            `⚠️ relationReviewQueue 写入失败(${item.code}/${item.chainId}/${item.source}):${String(e).slice(0, 160)}\n若批量出现:检查 relation_review_queue 唯一索引是否为 (code,chain_id,source) 三列(改库后需重跑 /api/admin/init-db)`
          );
        });
      return;
    }
    if (existing.status === "rejected") return; // 人工已拒,同源不复活(跨源语义见 UI 文案)
    const evidenceChanged = !!item.reason && item.reason !== existing.reason;
    // W3(五轮 review):同日重判(如 AI 审阅当天重跑出新判定过程)不能静默 no-op——
    // 面板刚展示了新裁决,队列却留着旧 reason。同日+证据变化 → 替换 reason/建议档但
    // 【不加 hitCount】(重判是替换不是新证据);同日+无变化才是真幂等。
    if (existing.lastSeen === item.date && !evidenceChanged) return;
    await db.relationReview.update({
      where: { id: existing.id },
      data: {
        lastSeen: item.date,
        ...(evidenceChanged
          ? {
              reason: item.reason,
              ...(existing.lastSeen !== item.date ? { hitCount: { increment: 1 } } : {}),
            }
          : {}),
        ...(item.suggestedType !== undefined ? { suggestedType: item.suggestedType } : {}),
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
// W2(五轮 review):只允许从 pending 出发——终态行(confirmed/rejected)拒绝二次写,
// 防 RSC 陈旧刷新闪回后管理员误点导致终审结论被反向覆写(改判走 DB,保审计)。
export async function setReviewStatus(
  id: string,
  status: ReviewStatus,
  note?: string
): Promise<"ok" | "not-pending" | "error"> {
  const db = getPrisma();
  if (!db) return "error";
  try {
    const r = await db.relationReview.updateMany({
      where: { id, status: "pending" },
      data: { status, ...(note !== undefined ? { note: note === "" ? null : note } : {}) },
    });
    return r.count > 0 ? "ok" : "not-pending";
  } catch {
    return "error";
  }
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
