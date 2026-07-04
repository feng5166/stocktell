import Dashboard, { type StockInsightMap } from "@/components/Dashboard";
import { STOCKS } from "@/data/stocks";
import { CHAINS } from "@/data/chains";
import { insightBundleForCode } from "@/lib/relation";

// 产业链地图:服务端(静态)算好每只票的核定关系/环节/reason/所属链精简 map 传客户端。
// 只有被 insight 核过的票(~数十只)进 map,不把 insight 全文拖进客户端包(同 watch-relation 手法)。
// 保持静态:走 Vercel 边缘缓存,大陆用户 TTFB 最优(首字节快 > 首帧 DOM 小)。
export default function StocksPage() {
  const slugToChain = new Map(
    Object.values(CHAINS)
      .filter((c) => c.insightSlug)
      .map((c) => [c.insightSlug as string, { name: c.name, id: c.id }])
  );
  const insightMap: StockInsightMap = {};
  for (const s of STOCKS) {
    const b = insightBundleForCode(s.code);
    if (b) {
      const ch = slugToChain.get(b.chainSlug);
      insightMap[s.code] = { ...b, chainName: ch?.name ?? "", chainId: ch?.id };
    }
  }
  return <Dashboard insightMap={insightMap} />;
}
