import Dashboard, { type StockInsightMap, type ChainOpt } from "@/components/Dashboard";
import { STOCKS } from "@/data/stocks";
import {
  resolveRelationsForCode,
  resolvePrimary,
  chainList,
  segmentsOfChain,
} from "@/lib/relation-resolver";

// P1 Phase 2:/stocks 走统一关系源(relationResolver,读审阅后 staticRelations)。服务端(静态)算好
// 每只票的主关系 + 所属链/环节精简 map 传客户端,并带链/环节下拉选项供筛选。只有被核定的票进 map,
// 未覆盖的票在前台显"未纳入产业链覆盖"(不静默消失)。
const FRONT: Record<string, string> = {
  direct: "直接映射",
  indirect: "间接映射",
  sentiment: "情绪映射",
  weak: "弱映射",
  trigger: "触发源",
  candidate: "待验证",
};

export default function StocksPage() {
  const insightMap: StockInsightMap = {};
  for (const s of STOCKS) {
    const rels = resolveRelationsForCode(s.code);
    if (!rels.length) continue;
    const primary = resolvePrimary(s.code);
    if (!primary) continue;
    insightMap[s.code] = {
      relation: FRONT[primary.relationType] ?? "待验证",
      segment: primary.segmentName,
      reason: primary.reason,
      chainSlug: primary.relatedInsightIds?.[0] ?? "", // 看因果链链接(仅 insight 核定的有)
      chainId: primary.chainId,
      chainName: primary.chainName,
      chains: Array.from(new Set(rels.map((r) => r.chainId))),
      segments: rels.map((r) => ({ chainId: r.chainId, segmentId: r.segmentId, segmentName: r.segmentName })),
    };
  }
  const chains: ChainOpt[] = chainList();
  const segsByChain: Record<string, { segmentId: string; segmentName: string }[]> = {};
  for (const c of chains) segsByChain[c.chainId] = segmentsOfChain(c.chainId);
  return <Dashboard insightMap={insightMap} chains={chains} segsByChain={segsByChain} />;
}
