// 产业链配置(分享机制 V1)。结构链无关,承接 docs/share-mechanism-v1-ai-chain.md:
// infra 参数化 chainId,但 V1 只点亮 ai 一条——未来加链只在此登记。
import { STOCKS, TIER, SECTOR_GLOSS, type Stock } from "@/data/stocks";

export interface ChainSegment {
  name: string; // 环节名(heat/mappings 的 segment 枚举)
  plain: string; // 人话:这环节是干嘛的
  sectors: string[]; // 对应 stocks.ts 的 sector 值(受益股→环节 的规则映射,不走 LLM)
  defaultRelation: "直接映射" | "间接映射" | "情绪映射"; // 未被 insight 核定时的环节级默认关系
  verifyTemplate: string[]; // 环节级验证点模板(P1 自选闭环复用同一份,拍板⑨)
}

export interface ChainConfig {
  id: string;
  name: string; // "AI 产业链"
  short: string; // "AI 链"
  tagline: string;
  aMembers: Stock[]; // A 股成分(游客也能加自选)
  insightSlug?: string; // 对应 /insight/[slug] 因果链深读(链页「看它怎么传到 A 股」出口)
  segments?: ChainSegment[]; // 每日推理的环节枚举(insight 管线 PRD §4.3);「其他链上环节」为兜底段不进 heat
}

export const CHAINS: Record<string, ChainConfig> = {
  ai: {
    id: "ai",
    name: "AI 产业链",
    short: "AI 链",
    tagline: "隔夜美股 AI 涨了,今天 A 股哪条链、哪只票跟着动——一页看懂。",
    aMembers: STOCKS.filter((s) => s.market === "A股"),
    insightSlug: "ai-infra",
    segments: [
      { name: "光模块/高速互连", plain: "数据中心里机器之间高速传数据的「光接头」", sectors: ["光模块/CPO", "交换机/网络"], defaultRelation: "直接映射", verifyTemplate: ["800G/1.6T 订单", "海外云厂资本开支", "毛利率"] },
      { name: "存储/HBM", plain: "贴着 AI 芯片的「快内存」与存储", sectors: ["存储/HBM"], defaultRelation: "直接映射", verifyTemplate: ["存储合约价", "HBM 产能预订", "库存周期"] },
      { name: "半导体设备", plain: "造芯片用的机器(刻蚀/沉积/量测)", sectors: ["半导体设备"], defaultRelation: "直接映射", verifyTemplate: ["设备订单", "晶圆厂资本开支", "国产替代招标"] },
      { name: "先进封装/封测", plain: "把芯片和内存「叠装」起来的高级工艺与材料", sectors: ["封装测试/代工", "半导体材料"], defaultRelation: "间接映射", verifyTemplate: ["先进封装稼动率", "客户导入", "毛利率"] },
      { name: "服务器/算力代工", plain: "组装 AI 服务器的厂和它的电路板", sectors: ["服务器/算力", "PCB/CCL"], defaultRelation: "直接映射", verifyTemplate: ["服务器出货量", "云厂 capex", "订单结构"] },
      { name: "液冷/温控", plain: "机器太热,用液体给它降温", sectors: ["液冷/温控"], defaultRelation: "间接映射", verifyTemplate: ["液冷订单", "渗透率", "收入占比"] },
      { name: "数据中心电力", plain: "给数据中心供电配电的设备与能源", sectors: ["电源/HVDC", "能源/核电", "数据中心/IDC"], defaultRelation: "间接映射", verifyTemplate: ["供配电订单", "数据中心开工", "客户验证"] },
      { name: "铜连接/高速互连(铜)", plain: "机柜内近距离连接用的「铜线」", sectors: ["铜连接/高速互连"], defaultRelation: "间接映射", verifyTemplate: ["供货确认", "GB 系统出货节奏"] },
      { name: "国产算力芯片", plain: "国产 AI 芯片及配套 IP", sectors: ["AI芯片/GPU", "EDA/IP"], defaultRelation: "情绪映射", verifyTemplate: ["客户导入", "国产替代订单", "收入兑现"] },
      { name: "其他链上环节", plain: "链上其余配套方向", sectors: [], defaultRelation: "情绪映射", verifyTemplate: ["订单与客户验证", "板块共振"] },
    ],
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
  take: string; // 为什么在这条链里(一句话)
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
