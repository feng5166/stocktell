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
import { DIRECT_EVIDENCE, REASON_APPEND } from "./direct-evidence";
import { INDIRECT_EVIDENCE } from "./indirect-evidence.generated";

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
  // P1-3(负责人 2026-07-06 严格 remove):AI 应用【不再】挂 ai-infra,独立 chainId=ai-application。
  // 不用 ai-infra 兼容 AI 应用——否则 ai-infra 退回泛 AI 概念池。验证=AI 功能商业化收入/付费转化,非供货订单。
  "ai-application": { chainId: "ai-application", chainName: "AI 应用链" },
};
const chainNameOf = (chainId: string) =>
  chainId === "data-center-power"
    ? "AI 数据中心电力基础设施链"
    : chainId === "ai-application"
      ? "AI 应用链"
      : chainId === "semiconductor-equipment"
        ? "半导体设备与先进制程链"
        : "AI 推理基础设施链";

// P1-3:电力股【不留在 ai-infra】(只归 data-center-power)。从 AI_INFRA insight 派生时排除这些 code。
// AI 推理链→电力/温控/液冷的外溢由【链级外溢关系】表达,不塞进 ai-infra 的 stock relation。
const AI_INFRA_REMOVE = new Set(["002837", "300693", "002518", "600875"]); // 英维克/盛弘/科士达/东方电气

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
    if (meta.chainId === "ai-infra" && AI_INFRA_REMOVE.has(m.code)) continue; // P1-3:电力股不进 ai-infra
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
// 2.2-B:审阅时标注"建议移入半导体设备/EDA链、若留仅 sentiment"的票,新链落地后按原建议移出
// ai-infra(它们在 §2.5 以 candidate 归新链;一票一链=P1-3 口径,不留双链)。
const MOVED_TO_SEMI = new Set(["301269"]); // 华大九天(audit 原文:EDA 属半导体设计工具)
for (const u of AI_INFRA_UPGRADES) {
  if (MOVED_TO_SEMI.has(u.code)) continue;
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

// 2.5) 半导体设备与先进制程链(2.2-B MVP,2026-07-07 负责人拍板扩链)。
//    传导:AI 芯片需求/先进制程扩产 → 晶圆厂资本开支 → 设备各环节 → 订单/国产替代/收入验证。
//    【第一版口径纪律】:国内候选一律 candidate 档(证据不足未归档,待审阅台人工校准后才升
//    direct/indirect 并补 references)——不编造证据=铁律②;不收 sentiment/weak 大池;
//    KLAC/TEL/精测电子/概伦电子 不在股票池,入池后再补(第二批)。
export const SEMI_EQUIP_CHAIN_ID = "semiconductor-equipment";
export const SEMI_EQUIP_CHAIN_NAME = "半导体设备与先进制程链";
export const SEMI_EQUIP_SEGMENTS = [
  "光刻与涂胶显影",
  "刻蚀设备",
  "薄膜沉积",
  "清洗设备",
  "CMP / 抛光",
  "量测检测",
  "EDA / IP",
  "先进封装设备",
] as const;
const SEMI_SEG_VERIFY: Record<string, string[]> = {
  光刻与涂胶显影: ["涂胶显影机订单", "产线导入进度", "设备收入占比"],
  刻蚀设备: ["刻蚀设备订单", "晶圆厂资本开支", "国产替代招标"],
  薄膜沉积: ["沉积设备订单", "先进制程验证进度", "客户结构"],
  清洗设备: ["清洗设备订单", "海内外客户导入", "收入占比"],
  "CMP / 抛光": ["CMP 设备订单", "产线验证", "耗材配套收入"],
  量测检测: ["测试/量测设备订单", "封测厂资本开支", "毛利率"],
  "EDA / IP": ["工具授权收入", "客户续约与导入", "国产替代进度"],
  先进封装设备: ["先进封装设备订单", "封装产能扩张", "客户验证"],
};
// 国内成分(segment 按主业务归一,与 stocks.ts positioning 一致)。
// 2026-07-07 校准回灌:负责人经 AI 审阅面板逐票终审,采纳 5 只升 direct(设备主业与链环节
// 短传导,证据状态 partially_verified,references/四段验证点见 direct-evidence.ts);
// 盛美/长川/华大九天未终审,维持 candidate。审计痕迹:relationReviewQueue source=ai-review 行。
const SEMI_CANDIDATES: Array<{ code: string; segment: string; relationType: "direct" | "candidate"; reason: string }> = [
  { code: "002371", segment: "刻蚀设备", relationType: "direct", reason: "国产半导体设备平台(刻蚀/薄膜沉积等多品类),设备主业直接进入刻蚀/沉积环节;后续看设备订单、国产替代招标与收入确认" },
  { code: "688012", segment: "刻蚀设备", relationType: "direct", reason: "刻蚀设备主业,直接服务先进制程与存储扩产;后续看刻蚀设备订单、客户验证与收入占比" },
  { code: "688072", segment: "薄膜沉积", relationType: "direct", reason: "薄膜沉积设备(PECVD/ALD 等)主业,直接进入沉积环节;后续看沉积设备订单、先进制程验证进度与客户结构" },
  { code: "688037", segment: "光刻与涂胶显影", relationType: "direct", reason: "涂胶显影设备主业,直接配套光刻环节;后续看涂胶显影机订单、产线导入进度与设备收入占比" },
  { code: "688120", segment: "CMP / 抛光", relationType: "direct", reason: "CMP 抛光设备主业,直接进入抛光环节;后续看 CMP 设备订单、产线验证与耗材配套收入" },
  { code: "688082", segment: "清洗设备", relationType: "candidate", reason: "半导体清洗设备主业;候选档待人工校准,后续看清洗设备订单、海内外客户导入与收入占比" },
  { code: "300604", segment: "量测检测", relationType: "candidate", reason: "半导体测试设备(测试机/分选机)主业;候选档待人工校准,后续看测试设备订单、封测厂资本开支与毛利率" },
  { code: "301269", segment: "EDA / IP", relationType: "candidate", reason: "国产 EDA 工具主业(audit 原建议自 ai-infra 移入本链);候选档待人工校准,后续看工具授权收入、客户续约导入与国产替代进度" },
  // 2.2-B 第二批(2026-07-07 入池)
  { code: "300567", segment: "量测检测", relationType: "candidate", reason: "半导体/显示量测检测设备主业;候选档待人工终审,后续看半导体检测设备订单、客户导入与收入占比" },
  { code: "688206", segment: "EDA / IP", relationType: "candidate", reason: "国产 EDA(器件建模/电路仿真)主业;候选档待人工终审,后续看工具授权收入、客户续约与国产替代进度" },
];
for (const c of SEMI_CANDIDATES) {
  const key = `${c.code}|${SEMI_EQUIP_CHAIN_ID}`;
  if (seen.has(key)) continue;
  seen.add(key);
  const st = STOCK_MAP[c.code];
  relations.push({
    code: c.code,
    name: st?.name ?? c.code,
    market: mktOf(st?.market),
    chainId: SEMI_EQUIP_CHAIN_ID,
    chainName: SEMI_EQUIP_CHAIN_NAME,
    segmentId: segId(c.segment),
    segmentName: c.segment,
    relationType: c.relationType,
    confidence: c.relationType === "direct" ? "medium" : "low",
    reason: c.reason,
    verificationPoints: SEMI_SEG_VERIFY[c.segment] ?? GENERIC_VERIFY, // direct 由证据层覆写四段式
    evidenceStatus: "needs_review", // direct 由 DIRECT_EVIDENCE 覆写 partially_verified
    source: "manual",
    lastReviewedAt: "2026-07-07",
    updatedAt: "2026-07-07",
  });
}

// 3) 美股 → trigger,按审阅【分组】(不再一类"海外事件触发源")。chainId=null 的
//    智能车机器人/航天军工/加密仍是未来链;semiconductor 组自 2.2-B 起有家(派生层路由,
//    不改 audit generated 文件);电力触发源归 data-center-power。
//    四轮 review V-T2:整组路由会把 audit 组里【未逐票评审】的票(IPGP 激光器/SITM 时钟/
//    VECO/AMKR 封测/ENTG 材料等)一并放上前台,违反一票一审——收窄为显式 allowlist,
//    只放负责人拍板点名且在池的 5 只;其余留在未来链,逐票评审后再加。
const SEMI_TRIGGER_ALLOW = new Set(["ASML", "AMAT", "LRCX", "CDNS", "SNPS"]);
// 2.2-B 第二批:KLAC 新入池(不在 audit TRIGGER_CLASS 里),负责人拍板点名=已过逐票评审,
// 显式登记为半导体设备链触发源(量测检测环节的海外前瞻信号源)。
const SEMI_TRIGGER_EXTRA = new Set(["KLAC"]);
for (const st of STOCKS) {
  if (st.market !== "美股") continue;
  const cls = TRIGGER_CLASS[st.code];
  const extraSemi = !cls && SEMI_TRIGGER_EXTRA.has(st.code);
  if (!cls && !extraSemi) continue;
  const routedChainId = extraSemi
    ? SEMI_EQUIP_CHAIN_ID
    : (cls!.chainId ??
      (cls!.group === "semiconductor" && SEMI_TRIGGER_ALLOW.has(st.code) ? SEMI_EQUIP_CHAIN_ID : null));
  if (!routedChainId) continue; // 未分类 / 仍是未来链 / 未过逐票评审 → 跳过
  const key = `${st.code}|${routedChainId}`;
  if (seen.has(key)) continue;
  seen.add(key);
  relations.push({
    code: st.code,
    name: st.name,
    market: "US",
    chainId: routedChainId,
    chainName: chainNameOf(routedChainId),
    segmentId: "trigger-source",
    segmentName: "海外事件触发源",
    relationType: "trigger",
    triggerGroup: extraSemi ? "semiconductor" : cls!.group,
    confidence: "medium",
    reason: st.positioning,
    verificationPoints: ["事件是否涉及 AI 产品/商业化/订单", "对国内是产业传导还是情绪外溢"],
    evidenceStatus: "manual_only",
    source: "chain",
    updatedAt: "2026-07-04",
  });
}

// 4) 证据层(负责人 2026-07-04 审阅通过):direct + indirect 补 references + 四段式验证点 + 证据状态,
//    清审阅台"缺证据"红/黄旗。references 指向法定披露入口(不自产 URL),诚实标注证据状态。
const CONCEPT_RE = /受益|机会|龙头|弹性|空间|景气/;
const VERIFY_RE = /后续看|验证|订单|客户|收入|毛利|占比|交付|披露|财报|供货|营收/;
for (const r of relations) {
  const ev = r.relationType === "direct" ? DIRECT_EVIDENCE[r.code] : r.relationType === "indirect" ? INDIRECT_EVIDENCE[r.code] : undefined;
  if (ev) {
    r.references = ev.references;
    r.verificationPoints = ev.verificationPoints;
    if (ev.evidenceStatus) r.evidenceStatus = ev.evidenceStatus;
    if (ev.reasonAppend && !r.reason.includes(ev.reasonAppend.replace(/^[;；]/, ""))) r.reason += ev.reasonAppend;
  }
  // 概念词无验证点 → 补 reason 验证点(guard:仅补真含概念词且无验证点的那条,不误伤同 code 另一关系)
  const app = REASON_APPEND[r.code];
  if (app && CONCEPT_RE.test(r.reason) && !VERIFY_RE.test(r.reason)) r.reason += app;
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
