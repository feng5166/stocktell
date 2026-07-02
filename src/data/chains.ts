// 产业链配置(分享机制 V1)。结构链无关,承接 docs/share-mechanism-v1-ai-chain.md:
// infra 参数化 chainId,但 V1 只点亮 ai 一条——未来加链只在此登记。
import { STOCKS, TIER, SECTOR_GLOSS, type Stock } from "@/data/stocks";

export interface ChainConfig {
  id: string;
  name: string; // "AI 产业链"
  short: string; // "AI 链"
  tagline: string;
  aMembers: Stock[]; // A 股成分(游客也能加自选)
}

export const CHAINS: Record<string, ChainConfig> = {
  ai: {
    id: "ai",
    name: "AI 产业链",
    short: "AI 链",
    tagline: "隔夜美股 AI 涨了,今天 A 股哪条链、哪只票跟着动——一页看懂。",
    aMembers: STOCKS.filter((s) => s.market === "A股"),
  },
};

export function getChain(id: string): ChainConfig | null {
  return CHAINS[id] ?? null;
}

// 落地页/海报用的精简成分行(服务端 → 客户端,别把整个 Stock 传过去)
export interface RosterItem {
  code: string;
  name: string;
  sector: string;
  gloss: string; // 板块大白话
  take: string; // 散户怎么想(一句话)
  tier: "龙头" | "二线" | null;
}

export function rosterOf(chain: ChainConfig): RosterItem[] {
  return chain.aMembers.map((s) => ({
    code: s.code,
    name: s.name,
    sector: s.sector,
    gloss: SECTOR_GLOSS[s.sector] ?? "",
    take: s.retailTake,
    tier: TIER[s.code] ?? null,
  }));
}
