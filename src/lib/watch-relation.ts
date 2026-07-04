// 自选股 → 产业链身份(P1 和我相关结构化;拍板⑨:静态映射,不逐股 LLM)。
// Phase 2:改读统一关系源(relationResolver → 审阅后 staticRelations),与 /stocks、stock 页同源、消双轨。
// 服务端算好全 A 股池的精简映射(股票→链/环节/关系三档/验证点)传客户端,客户端拿自选 codes 本地查
// + 叠加今日事件渲染关系卡。零额外请求,不把 insight-chains 全文拖进客户端包(只传算好的精简 Record)。
// 未被核定的自选票【不进 map】→ 消费方(BriefingFeed)显"暂未覆盖",不静默消失。
import { STOCKS } from "@/data/stocks";
import { resolvePrimary } from "@/lib/relation-resolver";

export interface WatchChainInfo {
  chainId: string;
  chainName: string;
  segment: string;
  relation: "直接映射" | "间接映射" | "情绪映射"; // 前台三档(弱映射归并入情绪映射)
  verify: string[];
}

// 模型 relationType → 前台三档(弱→情绪;A 股核定关系只会是 direct/indirect/sentiment/weak)
const FRONT3: Record<string, WatchChainInfo["relation"]> = {
  direct: "直接映射",
  indirect: "间接映射",
  sentiment: "情绪映射",
  weak: "情绪映射",
};

// 全池映射:code → 链身份(A 股;主关系取最强档)。走 resolvePrimary 唯一入口,读审阅后模型。
export function buildWatchChainMap(): Record<string, WatchChainInfo> {
  const map: Record<string, WatchChainInfo> = {};
  for (const s of STOCKS) {
    if (s.market !== "A股") continue; // "和我相关"卡=A 股链身份;美股触发源不在此
    const p = resolvePrimary(s.code);
    if (!p) continue;
    const front = FRONT3[p.relationType];
    if (!front) continue; // trigger/candidate 不进三档卡;未覆盖由消费方显"暂未覆盖"
    map[s.code] = {
      chainId: p.chainId,
      chainName: p.chainName,
      segment: p.segmentName,
      relation: front,
      verify: p.verificationPoints.slice(0, 3),
    };
  }
  return map;
}
