// 事件 → 关系标签(评审:事件卡不用「高影响」暗示结果,改关系分级)。
// 数据源 = insight 里人工核过的个股关系分级(直接/间接/情绪映射/弱);
// 条目关系 = 其映射标的中最强的一档;都不在册 → 「产业链相关」兜底,不妄判。
// 服务端使用(insight 数据别拖进客户端包),页面算好 map 传给客户端组件。
import { INSIGHT_CHAINS, type Relation } from "@/data/insight-chains";

const ORDER: Relation[] = ["直接", "间接", "情绪映射", "弱"];

const codeRel = new Map<string, Relation>();
for (const ins of Object.values(INSIGHT_CHAINS)) {
  for (const m of ins.mappings) {
    if (!m.code) continue;
    const prev = codeRel.get(m.code);
    if (!prev || ORDER.indexOf(m.relation) < ORDER.indexOf(prev)) {
      codeRel.set(m.code, m.relation);
    }
  }
}

export const RELATION_FALLBACK = "产业链相关";

// 单只票的核定关系(insight mappings 人工核过的);没核过返回 null(调用方用环节默认档)。
// 后台四档原值(含「弱」);前台展示归三档见 relationLabelFor。
export function relationForCode(
  code: string
): "直接映射" | "间接映射" | "情绪映射" | "弱映射" | null {
  const r = codeRel.get(code);
  if (!r) return null;
  return r === "直接" ? "直接映射" : r === "间接" ? "间接映射" : r === "弱" ? "弱映射" : "情绪映射";
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
