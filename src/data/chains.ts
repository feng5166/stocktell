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
  todayFraming?: string; // 非 ai 链的「今天怎么看这条链」静态口径(该链无专属 cron/事件,不用 AI 事件兜底)
  sentimentTitle?: string; // 链页情绪卡标题(不写死 AI)
  relatedInsights?: { slug: string; label: string }[]; // 链页深化入口(如 AI 链 → 应用侧「为什么没有直接映射」insight)
  // 链页 roster 分组覆写(B2-8:各链自带,不再无条件传给共用组件污染别的链)
  rosterGroups?: {
    groupOverride?: Record<string, string>; // code → 自定义分组键
    sectorLabels?: Record<string, string>; // 板块组名改写
    groupNotes?: Record<string, string>; // 组键 → 组说明
    bottomSectors?: string[]; // 置底组(按数组顺序)
  };
}

// AI 数据中心电力基础设施链成分(显式清单,与 AI 主链隔离)。这条链是 AI 基础设施的外溢链,
// 关注 AI 数据中心扩张对供配电/UPS/HVDC/温控/液冷/备用电源/电网侧的传导——不是 AI 主链本身。
// 关系分级见 insight「datacenter-power」mappings(单一来源)。
const DC_POWER_CODES = [
  "300693", "002518", "002335", "002837", "301018", "688676", "300870", "920808", // 供配电/温控/液冷基础设施(部分已在 AI 池,两链共用)
  "300499", "300990", "300602", "002028", "002851", "600875", "601985", "003816",
  "300249", "603912", "002364", "300068", "002922", // 本批新增专属标的
];

// 兜底段名(单一来源,review F10:此前 insight-pipeline / holiday-bridge / replay 三处字面量
// 拷贝,改名会静默漂移)。语义:不进 heat、不进节后观察,只作受益股无法归段时的容器。
export const FALLBACK_SEGMENT = "其他链上环节";

export const CHAINS: Record<string, ChainConfig> = {
  ai: {
    id: "ai",
    name: "AI 产业链",
    short: "AI 链",
    tagline: "隔夜美股 AI 涨了,今天 A 股哪条链、哪只票跟着动——一页看懂。",
    // 隔离:排除只属其它链的专属标的(chains 不含 "ai"),不让电力链专属股污染 AI 主链
    aMembers: STOCKS.filter(
      (s) => s.market === "A股" && (!s.chains || s.chains.includes("ai"))
    ),
    insightSlug: "ai-infra",
    // 应用侧深化 insight(不独立成 chain,应用股属 AI 主链):从链页放入口
    relatedInsights: [
      { slug: "ai-application", label: "AI 应用为什么没有直接映射?" },
    ],
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
  "data-center-power": {
    id: "data-center-power",
    name: "AI 数据中心电力基础设施链",
    short: "电力基础设施链",
    tagline: "AI 数据中心扩张的外溢链:供配电、UPS、HVDC、温控、液冷、备用电源怎么跟着传导——不是 AI 主链本身。",
    aMembers: STOCKS.filter((s) => s.market === "A股" && DC_POWER_CODES.includes(s.code)),
    insightSlug: "datacenter-power",
    sentimentTitle: "这条链今日状态",
    todayFraming:
      "今天这条链的触发源主要来自 AI 基础设施投资预期和海外算力链波动。短期价格表现可能受市场情绪影响,但真正需要验证的是:数据中心建设是否继续推进,高功率机柜是否提升供配电、温控、液冷和备用电源需求,以及相关公司能否形成订单和收入确认。",
    rosterGroups: {
      groupOverride: { "002028": "输配电 / 电网侧外溢" }, // 思源:单独归组、保持间接,不混进弱/情绪
      sectorLabels: { "能源/核电": "能源侧外溢(弱 / 情绪映射)" },
      groupNotes: {
        "输配电 / 电网侧外溢":
          "和 AI 数据中心电力基础设施存在外层支撑关系,但传导距离比 UPS、温控、液冷更远,需通过数据中心项目、客户和订单验证",
        "能源/核电": "算力耗电宏大叙事的最远端,与数据中心建设缺明确连接,默认弱 / 情绪映射",
      },
      bottomSectors: ["输配电 / 电网侧外溢", "能源/核电"],
    },
    segments: [
      { name: "数据中心供配电/UPS/HVDC", plain: "给机房稳定供电、配电、后备(UPS)、高效供电(HVDC)", sectors: ["电源/HVDC"], defaultRelation: "直接映射", verifyTemplate: ["数据中心客户", "UPS/HVDC 订单", "电源系统收入占比"] },
      { name: "数据中心温控/液冷", plain: "给数据中心降温的专用空调与液冷系统", sectors: ["液冷/温控"], defaultRelation: "直接映射", verifyTemplate: ["数据中心温控/液冷订单", "客户项目", "收入占比"] },
      { name: "变压器/干变/配电", plain: "数据中心进出电用的变压器和配电", sectors: ["数据中心/IDC"], defaultRelation: "间接映射", verifyTemplate: ["干变订单", "数据中心配电项目", "毛利率"] },
      { name: "备用电源/储能", plain: "数据中心备用电源与削峰填谷", sectors: [], defaultRelation: "间接映射", verifyTemplate: ["数据中心备用电源订单", "储能项目客户", "收入占比"] },
      { name: "发电/核电(外溢最远)", plain: "发电装备与核电运营(算力耗电宏大叙事)", sectors: ["能源/核电"], defaultRelation: "情绪映射", verifyTemplate: ["装机/并网进度", "与数据中心的直接连接(多为无)"] },
      { name: "其他链上环节", plain: "链上其余配套方向", sectors: [], defaultRelation: "情绪映射", verifyTemplate: ["订单与客户验证", "数据中心收入占比"] },
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
