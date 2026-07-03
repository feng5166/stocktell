// 自选股 → 产业链身份(P1 和我相关结构化;拍板⑨:静态映射,不逐股 LLM)。
// 服务端算好全 A 股池的精简映射(股票→链/环节/关系三档/验证点)传客户端,
// 客户端拿自选 codes 本地查 + 叠加今日事件(items)渲染关系卡。零额外请求,
// 且不把 insight-chains 全文拖进客户端包(只传算好的精简 Record)。
import { CHAINS, type ChainSegment } from "@/data/chains";
import { STOCK_MAP } from "@/data/stocks";
import { relationForCode, segmentForCode } from "@/lib/relation";

export interface WatchChainInfo {
  chainId: string;
  chainName: string;
  segment: string;
  relation: "直接映射" | "间接映射" | "情绪映射"; // 前台三档(弱映射归并入情绪映射)
  verify: string[];
}

// 后台四档 → 前台三档
function toFront(r: string): WatchChainInfo["relation"] {
  return r === "直接映射" ? "直接映射" : r === "间接映射" ? "间接映射" : "情绪映射";
}

// sector → 环节(取该链 segments 里 sectors 命中的;命中不到落兜底段)
function segmentOf(segments: ChainSegment[], sector: string | undefined): ChainSegment {
  const hit = sector ? segments.find((s) => s.sectors.includes(sector)) : undefined;
  return hit ?? segments[segments.length - 1]; // 最后一个=「其他链上环节」兜底
}

// 全池映射:code → 链身份。M1 只有 ai 一条链,一只票落一个链;后续多链时先命中先占。
export function buildWatchChainMap(): Record<string, WatchChainInfo> {
  const map: Record<string, WatchChainInfo> = {};
  for (const chain of Object.values(CHAINS)) {
    if (!chain.segments?.length) continue;
    for (const stock of chain.aMembers) {
      if (map[stock.code]) continue; // 已被前一条链占用
      const seg = segmentOf(chain.segments, STOCK_MAP[stock.code]?.sector);
      // 环节 / 关系优先取 insight 核定(精细,口径一致);消除按 sector 粗分与核定的矛盾(V-1)。
      // 如澜起:核定「服务器内存接口/DDR5·间接」,而非 sector 粗分的「存储/HBM·直接」。
      const insightSeg = segmentForCode(stock.code);
      const rel = relationForCode(stock.code) ?? seg.defaultRelation;
      // 验证点:insight 核定环节与 chains 环节一致时用其模板,否则用中性验证点
      // (避免给 DDR5 标的挂上 HBM 验证——那正是核定 reason 里「别按 HBM 理解」要避免的)。
      const verify =
        insightSeg && insightSeg !== seg.name
          ? ["订单 / 客户导入", "收入占比", "毛利率 / 交付节奏"]
          : seg.verifyTemplate.slice(0, 3);
      map[stock.code] = {
        chainId: chain.id,
        chainName: chain.name,
        segment: insightSeg ?? seg.name,
        relation: toFront(rel),
        verify,
      };
    }
  }
  return map;
}
