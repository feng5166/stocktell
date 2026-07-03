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

export function relationLabelFor(item: {
  beneficiaries: { code: string }[];
}): string {
  let best: Relation | null = null;
  for (const b of item.beneficiaries) {
    const r = codeRel.get(b.code);
    if (r && (!best || ORDER.indexOf(r) < ORDER.indexOf(best))) best = r;
  }
  if (!best) return RELATION_FALLBACK;
  return best === "直接"
    ? "直接相关"
    : best === "间接"
    ? "间接相关"
    : best === "弱"
    ? "弱映射"
    : "情绪映射";
}
