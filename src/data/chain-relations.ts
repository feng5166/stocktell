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
import { AI_INFRA_UPGRADES, TRIGGER_CLASS } from "./chain-relations-audit.generated";
import { DIRECT_EVIDENCE } from "./direct-evidence";

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
  triggerGroup?: string; // trigger 分组(ai-infra/ai-application/data-center-power/semiconductor…),不再一类
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

// insight slug → 规范 chainId / chainName。审阅版:ai-application 不并入 ai-infra
// (AI 应用 A股移出、应用侧 segment 待接入),故此表不含 ai-application → AI_APPLICATION 派生被跳过。
const CHAIN_META: Record<string, { chainId: string; chainName: string }> = {
  "ai-infra": { chainId: "ai-infra", chainName: "AI 推理基础设施链" },
  "datacenter-power": { chainId: "data-center-power", chainName: "AI 数据中心电力基础设施链" },
  // AI 应用:挂 AI 主链下(chainId=ai-infra),但用其应用侧 segments(办公AI/金融AI…)与推理核心区分;
  // A股无 direct(insight 里就是 indirect/sentiment)。满足审阅"挂应用侧 segment、不放进推理核心"。
  "ai-application": { chainId: "ai-infra", chainName: "AI 推理基础设施链" },
};
const chainNameOf = (chainId: string) =>
  chainId === "data-center-power" ? "AI 数据中心电力基础设施链" : "AI 推理基础设施链";

// 电力链标准环节 enum(负责人 2026-07-04 拍板归并:原 37 个近义变体 → 8 标准环节;前台筛选只展示这 8 个)。
// 【硬约束】后续新增电力链关系必须从这里选,不允许自由文本 segment 名(杜绝"每票自造一个环节名")。
export const DC_POWER_SEGMENTS = [
  "UPS / 数据中心电源",
  "HVDC",
  "温控",
  "液冷",
  "供配电 / 变压器",
  "备用电源 / 储能",
  "输配电 / 电网侧外溢",
  "能源侧外溢",
] as const;
// 电力链 code → 标准环节(按主业务归一;只改 segment 名,不动关系档/reason/relationType)。
const DC_SEG_BY_CODE: Record<string, string> = {
  "300693": "UPS / 数据中心电源", // 盛弘股份
  "002518": "UPS / 数据中心电源", // 科士达
  "300870": "UPS / 数据中心电源", // 欧陆通(服务器电源)
  "002335": "UPS / 数据中心电源", // 科华数据
  "002851": "UPS / 数据中心电源", // 麦格米特(电源平台)
  "002364": "HVDC", // 中恒电气
  "002837": "温控", // 英维克(主业务=精密温控)
  "301018": "温控", // 申菱环境
  "300249": "温控", // 依米康
  "603912": "温控", // 佳力图
  "300499": "液冷", // 高澜股份
  "300990": "液冷", // 同飞股份
  "920808": "液冷", // 曙光数创
  "300602": "液冷", // 飞荣达
  "688676": "供配电 / 变压器", // 金盘科技
  "002922": "供配电 / 变压器", // 伊戈尔(变压器/磁性器件)
  "300068": "备用电源 / 储能", // 南都电源
  "002028": "输配电 / 电网侧外溢", // 思源电气
  "600875": "能源侧外溢", // 东方电气
  "601985": "能源侧外溢", // 中国核电
  "003816": "能源侧外溢", // 中国广核
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
    // 电力链:segment 归并到标准环节(只改名,verify 模板仍按原 segment 查)
    const segName = meta.chainId === "data-center-power" && DC_SEG_BY_CODE[m.code] ? DC_SEG_BY_CODE[m.code] : m.segment;
    relations.push({
      code: m.code,
      name: m.name,
      market: mktOf(st?.market),
      chainId: meta.chainId,
      chainName: meta.chainName,
      segmentId: segId(segName),
      segmentName: segName,
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

// 2) ai-infra 审阅升级/改档(29,candidate→direct/indirect/sentiment,带审阅 reason)。
//    审阅版【不再】从 CHAINS 广谱成分派生 candidate——那是"AI 概念大池"污染源,已移除。
for (const u of AI_INFRA_UPGRADES) {
  const key = `${u.code}|ai-infra`;
  if (seen.has(key)) continue;
  seen.add(key);
  const st = STOCK_MAP[u.code];
  relations.push({
    code: u.code,
    name: u.name,
    market: mktOf(st?.market),
    chainId: "ai-infra",
    chainName: "AI 推理基础设施链",
    segmentId: segId(u.segment),
    segmentName: u.segment,
    relationType: u.relationType,
    confidence: u.confidence,
    reason: u.reason,
    verificationPoints: SEG_VERIFY.get(u.segment) ?? GENERIC_VERIFY,
    evidenceStatus: "needs_review", // 审阅统一 needs_evidence:升级项须补订单/客户/收入证据
    source: "manual",
    lastReviewedAt: "2026-07-04",
    updatedAt: "2026-07-04",
  });
}

// 3) 美股 → trigger,按审阅【分组】(不再一类"海外事件触发源")。chainId=null 的(半导体设备/
//    智能车机器人/航天军工/加密)是未来链,不进当前静态库;电力触发源归 data-center-power。
for (const st of STOCKS) {
  if (st.market !== "美股") continue;
  const cls = TRIGGER_CLASS[st.code];
  if (!cls || !cls.chainId) continue; // 未分类 / 未来链 → 跳过
  const key = `${st.code}|${cls.chainId}`;
  if (seen.has(key)) continue;
  seen.add(key);
  relations.push({
    code: st.code,
    name: st.name,
    market: "US",
    chainId: cls.chainId,
    chainName: chainNameOf(cls.chainId),
    segmentId: "trigger-source",
    segmentName: "海外事件触发源",
    relationType: "trigger",
    triggerGroup: cls.group,
    confidence: "medium",
    reason: st.positioning,
    verificationPoints: ["事件是否涉及 AI 产品/商业化/订单", "对国内是产业传导还是情绪外溢"],
    evidenceStatus: "manual_only",
    source: "chain",
    updatedAt: "2026-07-04",
  });
}

// 4) direct 证据层(负责人 2026-07-04 起草待审):补 references + 验证点 + 证据状态,
//    清审阅台"direct 缺证据"红旗。references 指向法定披露页(不自产 URL),诚实标注证据状态。
for (const r of relations) {
  if (r.relationType !== "direct") continue;
  const ev = DIRECT_EVIDENCE[r.code];
  if (!ev) continue;
  r.references = ev.references;
  r.verificationPoints = ev.verificationPoints;
  if (ev.evidenceStatus) r.evidenceStatus = ev.evidenceStatus;
  if (ev.reasonAppend && !r.reason.includes(ev.reasonAppend.replace(/^[;；]/, ""))) r.reason += ev.reasonAppend;
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
// 一条链的全部环节(/stocks 环节筛选)。排除 trigger 伪环节("海外事件触发源"——触发源不是产业环节)。
export function segmentsOfChain(chainId: string): { segmentId: string; segmentName: string }[] {
  const m = new Map<string, string>();
  for (const r of relations)
    if (r.chainId === chainId && r.relationType !== "trigger") m.set(r.segmentId, r.segmentName);
  return Array.from(m, ([segmentId, segmentName]) => ({ segmentId, segmentName }));
}
export function allRelations(): StockChainRelation[] {
  return relations;
}
