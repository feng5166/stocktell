// ============================================================================
// 三层关系架构 · relationResolver(负责人 2026-07-04 拍板;设计见 docs/prd-chain-relation-model.md §0)。
// 唯一读入口:全站(/stocks、stock、watchlist、track、chain 页)都走这里,解"改一处漏几处"DRY。
//
// 三层:
//   ① staticRelations(= data/chain-relations.ts,只吃人工核定,长期有效)
//   ② dailyRelationSignals(每日管线当天事件信号,短期;骨架期空源,pipeline 后续写入)
//   ③ relationReviewQueue(多次命中待人工沉淀;骨架期空源)
//
// 硬规则(拍板③):dailyRelationSignals【绝不】自动提升 relationType。今日强事件只挂
// todaySignalStrength(独立字段),长期档位 relationType 仍只来自 staticRelations。三字段分开。
// ============================================================================
import {
  relationsForCode,
  primaryRelation,
  relationInChain,
  relationsInChain,
  chainList,
  segmentsOfChain,
  allRelations,
  type StockChainRelation,
  type RelationType,
} from "@/data/chain-relations";

// ---- 层②:每日事件信号(当天有效,不进静态库) ----
export type { SignalStrength } from "@/lib/signal-rank";
import type { SignalStrength } from "@/lib/signal-rank";
export type DailyRelationSignal = {
  code: string;
  chainId: string;
  date: string; // YYYY-MM-DD
  signalStrength: SignalStrength;
  eventId?: string;
  note?: string;
};

// ---- 层③:待人工沉淀队列 ----
export type RelationReviewItem = {
  code: string;
  chainId: string;
  suggestedType?: RelationType;
  hitCount: number;
  firstSeen: string;
  lastSeen: string;
  status: "pending" | "confirmed" | "rejected";
};

// ---- resolver 输出:长期档位 与 今日强度 分开(不混成一个字段) ----
export type ResolvedRelation = StockChainRelation & {
  todaySignalStrength: SignalStrength | null; // 今日触发强度(来自 daily,独立于 relationType)
  resolvedSource: "static" | "daily" | "review";
};

// 层② 2.1-W5 起有真源:lib/daily-signals.ts 从当日已发布简报【异步】派生。
// 本同步 getter 保持空——resolver 是全站同步热路径,不为层②破坏同步契约;
// 需要今日信号的消费方(/watchlist 服务端)用 deriveDailySignals(date) 按 code 聚合。
// (四轮 review C1:曾有 resolveWithSignals 逐链注入入口,两轮均无调用方——已删,
//  git 历史可找回;需要时用 deriveDailySignals + attachSignal 同款语义重新引入。)
export function getDailySignals(date: string): DailyRelationSignal[] {
  void date;
  return [];
}

// 层③ 2.1-W3 起已持久化(relation_review_queue 表,读写走 lib/relation-review.ts)。
// 本 getter 仍返回空:pending/confirmed 队列项【不是关系】,不影响解析(改档只走
// chain-relations.ts 代码评审=不变量#4)。若未来拍板「confirmed 候选上前台展示」,再接这里。
export function getReviewQueue(): RelationReviewItem[] {
  return [];
}

// 把 daily 信号并到静态关系上:只挂 todaySignalStrength,【不改 relationType】。
function attachSignal(
  r: StockChainRelation,
  signals: DailyRelationSignal[]
): ResolvedRelation {
  const sig = signals.find((s) => s.code === r.code && s.chainId === r.chainId);
  return { ...r, todaySignalStrength: sig?.signalStrength ?? null, resolvedSource: "static" };
}

// 唯一读入口 —— 一只票的全部链关系(合并三层)。
export function resolveRelationsForCode(code: string, date?: string): ResolvedRelation[] {
  const statics = relationsForCode(code);
  const signals = date ? getDailySignals(date).filter((s) => s.code === code) : [];
  return statics.map((r) => attachSignal(r, signals));
  // 注:静态无此关系、仅今日事件带出的候选,不在此凭 daily 判档——走 reviewQueue 人工沉淀后才进静态。
}

// 一只票的主关系(取最强档)。P1-2 口径(负责人 2026-07-06):**不得跨链取最强档来覆盖展示口径**。
// 有页面 chain context 时【必须】用 resolveInChain(本链)——如 ai-infra 页看英维克应得 null、不显示成 ai-infra 股。
// 本函数仅用于:①无 context 的兜底/排序(watchlist 若多链应展示多链关系卡,primary 只排序不覆盖);
// ②首屏一句话判断(个股页本身是单锚,取其唯一/最强关系)。P1-3 后模型已无多链股票(见 health 多链串档检测)。
export function resolvePrimary(code: string, date?: string): ResolvedRelation | null {
  const p = primaryRelation(code);
  if (!p) return null;
  const signals = date ? getDailySignals(date).filter((s) => s.code === code) : [];
  return attachSignal(p, signals);
}

// 本链核定关系(按 chain 取,消双轨/防越级)。
export function resolveInChain(code: string, chainId: string | undefined, date?: string): ResolvedRelation | null {
  const r = relationInChain(code, chainId);
  if (!r) return null;
  const signals = date ? getDailySignals(date).filter((s) => s.code === code) : [];
  return attachSignal(r, signals);
}

// 静态维度查询(/stocks 链/环节筛选、下拉)——静态库口径,直接透传(daily 不影响集合归属)。
export { relationsInChain, chainList, segmentsOfChain };

// code → 主关系前台标签(Phase 3-D:给 OvernightRadar 等 client 组件用,服务端算好传入,
// 避免把 chain-relations/insight-chains 拖进客户端包)。
const FRONT_LABEL: Record<RelationType, string> = {
  direct: "直接映射",
  indirect: "间接映射",
  sentiment: "情绪映射",
  weak: "弱映射",
  trigger: "触发源",
  candidate: "待验证",
};
export function buildRelLabelMap(): Record<string, string> {
  const m: Record<string, string> = {};
  for (const c of Array.from(new Set(allRelations().map((r) => r.code)))) {
    const p = primaryRelation(c);
    if (p) m[c] = FRONT_LABEL[p.relationType];
  }
  return m;
}

// P1-1(2026-07-06):链页 roster / 首页事件卡的关系标签走统一模型,替代旧 relation.ts 直读(消同票跨页两标签)。
const ITEM_RANK: Record<RelationType, number> = { direct: 0, indirect: 1, sentiment: 2, weak: 3, candidate: 4, trigger: 5 };
// 本链关系标签(链页 roster:chain-scoped,不跨链取最强档;本链无则 null → 调用方落"产业链相关")
export function resolveInChainLabel(code: string, chainId: string | undefined): string | null {
  const r = relationInChain(code, chainId);
  return r ? FRONT_LABEL[r.relationType] : null;
}

// 简报/admin 映射档:只返后台四档(trigger/candidate → null,落默认档)。返回类型与 insight-pipeline
// 的 MappingRelation 结构一致(直接/间接/情绪/弱映射),不 import 其 schema,避免反向依赖。
const MAPPING_LABEL: Partial<Record<RelationType, "直接映射" | "间接映射" | "情绪映射" | "弱映射">> = {
  direct: "直接映射",
  indirect: "间接映射",
  sentiment: "情绪映射",
  weak: "弱映射",
};
export function resolveInChainMappingLabel(
  code: string,
  chainId: string | undefined
): "直接映射" | "间接映射" | "情绪映射" | "弱映射" | null {
  const r = relationInChain(code, chainId);
  return r ? MAPPING_LABEL[r.relationType] ?? null : null;
}
// 事件项标签(首页/链页事件卡:取 beneficiaries 最强档)
export function resolveRelationLabelForItem(item: { beneficiaries: { code: string }[] }): string {
  let best: string | null = null;
  let bestRank = Infinity;
  for (const b of item.beneficiaries) {
    const p = primaryRelation(b.code);
    if (p && ITEM_RANK[p.relationType] < bestRank) {
      bestRank = ITEM_RANK[p.relationType];
      best = FRONT_LABEL[p.relationType];
    }
  }
  return best ?? "产业链相关";
}

// 事件卡门面标签(2.2.1b 展示解耦,2026-08-13 负责人调研实证):
// 「Vertiv 大涨」的门面标签是 事件→链 的触发关系,不是 股票→链 的映射档——
// 事件卡标「直接映射」会被读成「Vertiv 与英维克存在直接供应关系」。
// 有海外触发源的事件一律标「链级触发」;映射档只出现在卡内逐票 chip(那里语义本来就对)。
// 无触发源的条目(链内动态/国内事件)维持 beneficiaries 最强档聚合,语义不冲突。
export function resolveEventFaceLabel(item: {
  triggerCode?: string | null;
  beneficiaries: { code: string }[];
}): string {
  if (item.triggerCode) return "链级触发";
  return resolveRelationLabelForItem(item);
}
