// ============================================================================
// P1 产业链关系数据结构化 · 统一关系数据源(负责人 2026-07-04 拍板开工,任务书见
// docs/prd-chain-relation-model.md)。全站(首页/insight/chain/stocks/stock/watchlist/track)
// 吃这一份 StockChainRelation[],消灭"各页各拼逻辑 / 强中弱 vs 直接间接"的双轨。
//
// Phase 1(本文件):从现有源【派生】,不替换旧逻辑——insight mappings(核定关系)+ chain
// 成分(candidate)+ 美股(trigger)。旧 relation.ts / watch-relation 暂保留,Phase 2 逐个切到这里。
// ============================================================================
import { INSIGHT_CHAINS } from "./insight-chains";
import { CHAINS } from "./chains";
import { STOCKS, STOCK_MAP } from "./stocks";

export type RelationType =
  | "trigger" // 触发源:美股/海外公司(NVDA/PLTR/NOW),非 A 股映射标的
  | "direct" // 直接映射:短传导 + 明确业务入口
  | "indirect" // 间接映射:隔一层/暴露不纯,需订单客户收入验证
  | "sentiment" // 情绪映射:同主题联想,缺直接业务传导
  | "weak" // 弱映射:关系远,只作外围观察
  | "candidate"; // 待验证:入候选池,证据不足未明确归档

export type RelationReference = {
  title: string;
  url?: string;
  sourceType:
    | "company_report"
    | "exchange_disclosure"
    | "official_site"
    | "financial_data"
    | "news"
    | "manual_review";
  publishedAt?: string;
  note?: string;
};

export type StockChainRelation = {
  code: string;
  name: string;
  market: "CN" | "HK" | "US";
  chainId: string;
  chainName: string;
  segmentId: string;
  segmentName: string;
  relationType: RelationType;
  confidence: "high" | "medium" | "low";
  reason: string;
  verificationPoints: string[];
  relatedInsightIds?: string[];
  references?: RelationReference[];
  evidenceStatus?: "verified" | "partially_verified" | "needs_review" | "manual_only";
  source: "insight" | "chain" | "manual" | "auto_generated";
  lastReviewedAt?: string;
  updatedAt: string;
};

// ---- 口径映射(全站统一) ----
const REL_MAP: Record<string, RelationType> = {
  直接: "direct",
  间接: "indirect",
  情绪映射: "sentiment",
  弱: "weak",
};
const CONF_MAP: Record<string, "high" | "medium" | "low"> = {
  高: "high",
  中: "medium",
  低: "low",
  假设: "low",
};
const REL_RANK: Record<RelationType, number> = {
  direct: 0,
  indirect: 1,
  sentiment: 2,
  weak: 3,
  candidate: 4,
  trigger: 5,
};

// insight slug → 规范 chainId / chainName(任务书四:AI 应用挂 AI 主链 ai-infra 下)
const CHAIN_META: Record<string, { chainId: string; chainName: string }> = {
  "ai-infra": { chainId: "ai-infra", chainName: "AI 推理基础设施链" },
  "datacenter-power": { chainId: "data-center-power", chainName: "AI 数据中心电力基础设施链" },
  "ai-application": { chainId: "ai-infra", chainName: "AI 推理基础设施链" },
};

// CHAINS.id → 规范 chainId(成分股 candidate 派生用)
const CHAINID_MAP: Record<string, string> = {
  ai: "ai-infra",
  "data-center-power": "data-center-power",
};

const segId = (name: string) => name.replace(/[\s/()（）]+/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "");
const mktOf = (m?: string): "CN" | "HK" | "US" => (m === "美股" ? "US" : m === "港股" ? "HK" : "CN");

// 环节名 → verifyTemplate(从所有 CHAINS segments 汇总,给 insight 派生的 verificationPoints)
const SEG_VERIFY = new Map<string, string[]>();
for (const ch of Object.values(CHAINS))
  for (const seg of ch.segments ?? []) SEG_VERIFY.set(seg.name, seg.verifyTemplate);
const GENERIC_VERIFY = ["订单 / 客户导入", "收入占比", "毛利率 / 交付节奏"];

// ================= 派生 =================
const relations: StockChainRelation[] = [];
const seen = new Set<string>(); // code|chainId 去重(insight 优先于 chain candidate)

// 1) insight mappings → 核定关系(direct/indirect/sentiment/weak)
for (const ins of Object.values(INSIGHT_CHAINS)) {
  const meta = CHAIN_META[ins.slug];
  if (!meta) continue;
  for (const m of ins.mappings) {
    if (!m.code) continue;
    const key = `${m.code}|${meta.chainId}`;
    if (seen.has(key)) continue; // 同 code 同链只留最先(insight 内已去重)
    seen.add(key);
    const st = STOCK_MAP[m.code];
    relations.push({
      code: m.code,
      name: m.name,
      market: mktOf(st?.market),
      chainId: meta.chainId,
      chainName: meta.chainName,
      segmentId: segId(m.segment),
      segmentName: m.segment,
      relationType: REL_MAP[m.relation] ?? "candidate",
      confidence: CONF_MAP[m.confidence] ?? "medium",
      reason: m.reason,
      verificationPoints: SEG_VERIFY.get(m.segment) ?? GENERIC_VERIFY,
      relatedInsightIds: [ins.slug],
      evidenceStatus: m.confidence === "高" ? "verified" : m.confidence === "中" ? "partially_verified" : "needs_review",
      source: "insight",
      updatedAt: ins.updatedAt,
    });
  }
}

// 2) chain 成分股里未被 insight 核定的 → candidate(A 股;美股在第 3 步单独 trigger)
for (const [cid, chain] of Object.entries(CHAINS)) {
  const chainId = CHAINID_MAP[cid];
  if (!chainId || !chain.segments?.length) continue;
  for (const st of chain.aMembers) {
    if (st.market !== "A股") continue;
    const key = `${st.code}|${chainId}`;
    if (seen.has(key)) continue;
    seen.add(key);
    // sector → 环节(命中 segment 的 sectors;命中不到落兜底段)
    const seg =
      chain.segments.find((s) => s.sectors.includes(st.sector)) ??
      chain.segments[chain.segments.length - 1];
    relations.push({
      code: st.code,
      name: st.name,
      market: mktOf(st.market),
      chainId,
      chainName: CHAIN_META[chain.insightSlug ?? ""]?.chainName ?? chain.name,
      segmentId: segId(seg.name),
      segmentName: seg.name,
      relationType: "candidate",
      confidence: "low",
      reason: st.positioning,
      verificationPoints: seg.verifyTemplate.slice(0, 3),
      evidenceStatus: "needs_review",
      source: "chain",
      updatedAt: "2026-07-04",
    });
  }
}

// 3) 美股 → trigger(海外事件触发源,不进 candidate;任务书验收 #3)
for (const st of STOCKS) {
  if (st.market !== "美股") continue;
  const key = `${st.code}|ai-infra`;
  if (seen.has(key)) continue;
  seen.add(key);
  relations.push({
    code: st.code,
    name: st.name,
    market: "US",
    chainId: "ai-infra",
    chainName: "AI 推理基础设施链",
    segmentId: "trigger-source",
    segmentName: "海外事件触发源",
    relationType: "trigger",
    confidence: "medium",
    reason: st.positioning,
    verificationPoints: ["事件是否涉及 AI 产品/商业化/订单", "对国内是产业传导还是情绪外溢"],
    evidenceStatus: "manual_only",
    source: "chain",
    updatedAt: "2026-07-04",
  });
}

// ================= 访问器(页面统一入口) =================
const byCode = new Map<string, StockChainRelation[]>();
for (const r of relations) {
  const arr = byCode.get(r.code) ?? [];
  arr.push(r);
  byCode.set(r.code, arr);
}

// 一只票的全部链关系(跨链;stock 页/watchlist 用)
export function relationsForCode(code: string): StockChainRelation[] {
  return byCode.get(code) ?? [];
}
// 一只票的主关系(取最强档;首屏一句话判断用)
export function primaryRelation(code: string): StockChainRelation | null {
  const arr = byCode.get(code);
  if (!arr?.length) return null;
  return arr.slice().sort((a, b) => REL_RANK[a.relationType] - REL_RANK[b.relationType])[0];
}
// 本链核定关系(stock/chain/insight/watchlist 按【本链】取,消双轨/防越级)
export function relationInChain(code: string, chainId: string | undefined): StockChainRelation | null {
  if (!chainId) return null;
  return byCode.get(code)?.find((r) => r.chainId === chainId) ?? null;
}
// 一条链的全部关系(/stocks 链筛选)
export function relationsInChain(chainId: string): StockChainRelation[] {
  return relations.filter((r) => r.chainId === chainId);
}
// 全部链(/stocks 链下拉)
export function chainList(): { chainId: string; chainName: string }[] {
  const m = new Map<string, string>();
  for (const r of relations) m.set(r.chainId, r.chainName);
  return Array.from(m, ([chainId, chainName]) => ({ chainId, chainName }));
}
// 一条链的全部环节(/stocks 环节筛选)
export function segmentsOfChain(chainId: string): { segmentId: string; segmentName: string }[] {
  const m = new Map<string, string>();
  for (const r of relations) if (r.chainId === chainId) m.set(r.segmentId, r.segmentName);
  return Array.from(m, ([segmentId, segmentName]) => ({ segmentId, segmentName }));
}
export function allRelations(): StockChainRelation[] {
  return relations;
}
