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
      { name: FALLBACK_SEGMENT, plain: "链上其余配套方向", sectors: [], defaultRelation: "情绪映射", verifyTemplate: ["订单与客户验证", "板块共振"] },
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
      { name: FALLBACK_SEGMENT, plain: "链上其余配套方向", sectors: [], defaultRelation: "情绪映射", verifyTemplate: ["订单与客户验证", "数据中心收入占比"] },
    ],
  },
};

// 2.2-B(2026-07-07 拍板):半导体设备与先进制程链成分(显式清单,档位见 chain-relations §2.5:
// 5 direct 已终审 + candidate 待审)。第二批已入池:精测电子/概伦电子;TEL 暂缓(OTC 行情覆盖)。
const SEMI_EQUIP_CODES = ["002371", "688012", "688072", "688037", "688120", "688082", "300604", "301269", "300567", "688206"];

CHAINS["semiconductor-equipment"] = {
  id: "semiconductor-equipment",
  name: "半导体设备与先进制程链",
  short: "半导体设备链",
  tagline:
    "AI 芯片与先进制程扩产的上游链:晶圆厂资本开支怎么传导到光刻/刻蚀/沉积/清洗/CMP/量测/EDA/先进封装各环节——看订单与国产替代验证,不是半导体概念池。",
  aMembers: STOCKS.filter((s) => s.market === "A股" && SEMI_EQUIP_CODES.includes(s.code)),
  insightSlug: "semiconductor-equipment", // 2.2-B 三批:深读页(insight-chains.ts),归档路由同 slug
  sentimentTitle: "这条链今日状态",
  todayFraming:
    "今天这条链的触发源主要来自海外设备厂(ASML/AMAT/LRCX 等)财报与订单指引、先进制程扩产消息。短期价格可能被半导体情绪带动,但真正要验证的是:晶圆厂资本开支是否落地、设备订单与国产替代招标是否兑现、相关公司能否形成收入确认。当前成分全部为待验证档,关系分级以人工校准后的静态关系库为准。",
  // 2.2-B 第二批(2026-07-07):校准完成(5 只 direct 终审落库)→ 接入 segments,
  // 链级每日推理(insight-daily cron)与 08:30 看门狗自此按链纳管本链。
  // 环节与 chain-relations §2.5 的 8 标准 enum 同名同义(segment-registry 注册)。
  segments: [
    { name: "光刻与涂胶显影", plain: "光刻前后给晶圆涂胶显影的设备", sectors: ["半导体设备"], defaultRelation: "直接映射", verifyTemplate: ["涂胶显影机订单", "产线导入进度", "设备收入占比"] },
    { name: "刻蚀设备", plain: "在晶圆上精确「雕刻」电路的设备", sectors: ["半导体设备"], defaultRelation: "直接映射", verifyTemplate: ["刻蚀设备订单", "晶圆厂资本开支", "国产替代招标"] },
    { name: "薄膜沉积", plain: "往晶圆上「镀膜」的设备(PECVD/ALD)", sectors: ["半导体设备"], defaultRelation: "直接映射", verifyTemplate: ["沉积设备订单", "先进制程验证进度", "客户结构"] },
    { name: "清洗设备", plain: "制程间清洗晶圆的设备", sectors: ["半导体设备"], defaultRelation: "直接映射", verifyTemplate: ["清洗设备订单", "海内外客户导入", "收入占比"] },
    { name: "CMP / 抛光", plain: "把晶圆表面磨平的设备与耗材", sectors: ["半导体设备"], defaultRelation: "直接映射", verifyTemplate: ["CMP 设备订单", "产线验证", "耗材配套收入"] },
    { name: "量测检测", plain: "检查每步做没做对的量测与测试设备", sectors: ["半导体设备"], defaultRelation: "直接映射", verifyTemplate: ["测试/量测设备订单", "封测厂资本开支", "毛利率"] },
    { name: "EDA / IP", plain: "设计芯片用的软件工具与授权模块", sectors: ["EDA/IP"], defaultRelation: "间接映射", verifyTemplate: ["工具授权收入", "客户续约与导入", "国产替代进度"] },
    { name: "先进封装设备", plain: "芯片「叠装」环节用的专用设备", sectors: ["封装测试/代工"], defaultRelation: "间接映射", verifyTemplate: ["先进封装设备订单", "封装产能扩张", "客户验证"] },
    { name: FALLBACK_SEGMENT, plain: "链上其余配套方向", sectors: [], defaultRelation: "情绪映射", verifyTemplate: ["订单与客户验证", "板块共振"] },
  ],
};

// 华为产业生态链(2026-07-30 扩链,一批)。成分档位见 chain-relations §2.6:一律 candidate 待终审。
// 【刻意不配 segments】(= 不启用链级每日推理):①华为无美股上市主体,现行事件原子(隔夜美股
// 异动)覆盖不到本链主事件(国内发布会/公告),接了只会天天产"情绪外溢"套话;②本链环节 sector
// (智能车/大模型应用/服务器算力)与 AI 链高度重叠,sector→segment 映射会把 AI 事件受益股
// 吸进本链每日文档(buildMappingsDelta 按 sector 归段)。事件源扩展到国内公告后再接 segments。
// 池内光模块/PCB 等华为供应链标的(光迅/深南/沪电/华工)关系档归 AI 链(一票一链硬门禁),
// 本链深读页只作产业位置交叉引用,不重复分档。
const HUAWEI_CODES = ["002261", "301236", "300339", "000158", "688981", "601127"];

CHAINS["huawei-ecosystem"] = {
  id: "huawei-ecosystem",
  name: "华为产业生态链",
  short: "华为链",
  tagline:
    "华为新品与生态进展怎么传导到 A 股伙伴:昇腾/鲲鹏算力、鸿蒙软件生态、智选车各环节——看合作公告与订单验证,不是华为概念池。华为不上市、披露有限,本链验证入口天然弱于其它链;分档按四字段标准终审(直接 1 / 间接 3 / 情绪映射 2)。",
  aMembers: STOCKS.filter((s) => s.market === "A股" && HUAWEI_CODES.includes(s.code)),
  insightSlug: "huawei-ecosystem",
  sentimentTitle: "这条链今日状态",
  todayFraming:
    "这条链的主事件源是华为发布会、伙伴公告与交付数据(国内事件),当前站内事件原子以隔夜美股异动为主,所以本链日常更多是情绪联动而非直接触发。真正要验证的是:昇腾一体机与政企订单是否落地、鸿蒙/欧拉项目是否形成收入、问界交付量是否兑现。关系分级以静态关系库终审档为准;华为不上市,「华为概念」情绪权重高,涨跌未必对应真实业务变化。",
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
