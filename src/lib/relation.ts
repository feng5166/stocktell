// 事件 → 关系标签(评审:事件卡不用「高影响」暗示结果,改关系分级)。
// 数据源 = insight 里人工核过的个股关系分级(直接/间接/情绪映射/弱);
// 条目关系 = 其映射标的中最强的一档;都不在册 → 「产业链相关」兜底,不妄判。
// 服务端使用(insight 数据别拖进客户端包),页面算好 map 传给客户端组件。
import { INSIGHT_CHAINS, type Relation } from "@/data/insight-chains";

const ORDER: Relation[] = ["直接", "间接", "情绪映射", "弱"];

const codeRel = new Map<string, Relation>();
const codeSeg = new Map<string, string>(); // code → insight 核定 segment(精细,优先于 sector 粗分)
const codeReason = new Map<string, string>(); // code → 核定 reason(与最强关系同源;/stocks 地图行用)
const codeChain = new Map<string, string>(); // code → 最强关系所在链 slug(/stocks「所属链」用)
// 按链的核定关系/环节(B2-2:同一只票在不同链关系不同,如英维克 AI 链间接、电力链直接——
// 链页/自选卡必须按【本链】取,不能跨链取最强档把 AI 链的间接股越级成直接)。
const chainCodeRel = new Map<string, Map<string, Relation>>(); // slug → (code → relation)
const chainCodeSeg = new Map<string, Map<string, string>>(); // slug → (code → segment)
for (const ins of Object.values(INSIGHT_CHAINS)) {
  const relOf = new Map<string, Relation>();
  const segOf = new Map<string, string>();
  for (const m of ins.mappings) {
    if (!m.code) continue;
    // 全局最强档(事件卡跨链语义 relationLabelFor 用;别改)
    const prev = codeRel.get(m.code);
    if (!prev || ORDER.indexOf(m.relation) < ORDER.indexOf(prev)) {
      codeRel.set(m.code, m.relation);
      codeSeg.set(m.code, m.segment);
      codeReason.set(m.code, m.reason);
      codeChain.set(m.code, ins.slug);
    }
    // 本链档(链页/自选卡用;一只票一链至多一条,取更强的一条防重复)
    const p2 = relOf.get(m.code);
    if (!p2 || ORDER.indexOf(m.relation) < ORDER.indexOf(p2)) {
      relOf.set(m.code, m.relation);
      segOf.set(m.code, m.segment);
    }
  }
  chainCodeRel.set(ins.slug, relOf);
  chainCodeSeg.set(ins.slug, segOf);
}

const toFront = (r: Relation): "直接映射" | "间接映射" | "情绪映射" | "弱映射" =>
  r === "直接" ? "直接映射" : r === "间接" ? "间接映射" : r === "弱" ? "弱映射" : "情绪映射";

export interface InsightBundle {
  relation: "直接映射" | "间接映射" | "情绪映射" | "弱映射";
  segment: string;
  reason: string;
  chainSlug: string;
}
// 单只票的核定关系+环节+reason+所属链(全池最强档,跨链)。/stocks 产业链地图用:
// 服务端算好精简 map 传客户端(不把 insight 全文拖进客户端包)。没核过返回 null。
export function insightBundleForCode(code: string): InsightBundle | null {
  const r = codeRel.get(code);
  if (!r) return null;
  return {
    relation: toFront(r),
    segment: codeSeg.get(code) ?? "",
    reason: codeReason.get(code) ?? "",
    chainSlug: codeChain.get(code) ?? "",
  };
}

// 【本链】核定关系(链页/自选卡按 chain 取,消除跨链越级 B2-2);slug 缺省或没核过返回 null。
export function relationForCodeInChain(
  code: string,
  slug: string | undefined
): "直接映射" | "间接映射" | "情绪映射" | "弱映射" | null {
  if (!slug) return null;
  const r = chainCodeRel.get(slug)?.get(code);
  return r ? toFront(r) : null;
}
// 【本链】核定环节;slug 缺省或没核过返回 null。
export function segmentForCodeInChain(code: string, slug: string | undefined): string | null {
  if (!slug) return null;
  return chainCodeSeg.get(slug)?.get(code) ?? null;
}

// 单只票的 insight 核定环节(精细,如澜起=「服务器内存接口/DDR5」而非粗分「存储/HBM」)。
// 没核过返回 null。用于消除 watch-relation 按 sector 粗分与 insight 核定的口径矛盾(V-1)。
export function segmentForCode(code: string): string | null {
  return codeSeg.get(code) ?? null;
}

export const RELATION_FALLBACK = "产业链相关";

// 单只票的核定关系(insight mappings 人工核过的);没核过返回 null(调用方用环节默认档)。
// 后台四档原值(含「弱」);前台展示归三档见 relationLabelFor。
export function relationForCode(
  code: string
): "直接映射" | "间接映射" | "情绪映射" | "弱映射" | null {
  const r = codeRel.get(code);
  return r ? toFront(r) : null;
}

export function relationLabelFor(item: {
  beneficiaries: { code: string }[];
}): string {
  let best: Relation | null = null;
  for (const b of item.beneficiaries) {
    const r = codeRel.get(b.code);
    if (r && (!best || ORDER.indexOf(r) < ORDER.indexOf(best))) best = r;
  }
  if (!best) return RELATION_FALLBACK;
  // 语言资产定稿(评审):前台统一三档 直接映射/间接映射/情绪映射;
  // 「弱」只保留在后台/数据层,前台归并入情绪映射(M1 开工前增补 #5)
  return best === "直接"
    ? "直接映射"
    : best === "间接"
    ? "间接映射"
    : "情绪映射";
}
