// 推理链(ReasoningChain)种子数据 —— 内核"最小可证"实验:一条 AI 推理基础设施因果链。
// 隔离、纯加法:只被 /insight/[slug] 页读取,不进导航/首页,不改任何现有页面。删掉本文件+路由即回到现状。
// 定稿来源:docs/min-proof-ai-chain-2026-07-02.md(多专家起草 + 三路对抗评审:反换皮/券商级合规/产业专业性)。
// 合规:启动期从宽但定位不变——关系分级、非推荐、无买卖/目标价;个股仅为产业链关联的说明性示例。

export type Confidence = "高" | "中" | "低" | "假设";
export type HeatDir = "升温" | "降温" | "分化" | "中性";
export type Relation = "直接" | "间接" | "情绪映射" | "弱";

export interface Hop {
  order: number;
  from: string;
  to: string;
  logic: string;
  evidenceType: string;
  evidenceExample?: string;
  confidence: Confidence;
  caveat?: string; // 证伪/空头读法/不确定性
}
export interface HeatRow {
  segment: string;
  direction: HeatDir;
  intensity: number; // 1-5,逻辑关联+证据完整度强弱(非收益/涨幅)
  reason: string;
}
export interface StockMap {
  name: string;
  code?: string; // 有则跳个股页(且需在股池内)
  segment: string;
  relation: Relation; // 传导层级(供货/配套距离),非受益程度
  reason: string;
  confidence: Confidence;
}
export interface InsightChain {
  slug: string;
  title: string;
  updatedAt: string;
  event: string;
  eventNote: string; // 占位说明
  whyThisEvent: string; // 反换皮:为什么是"这一个"事件
  oneLiner: string; // 一句话判断(合规改写)
  differentiators: string[]; // 强于聚合的差异点(置顶)
  heatmapNote: string;
  heatmap: HeatRow[];
  hopsNote: string;
  mainHops: Hop[]; // 递进主链
  branchHops: Hop[]; // 由主链扇出的并行映射分支
  mappingNote: string;
  mappings: StockMap[];
  uncertainties: string[]; // 已知不确定性(面向用户)
  disclaimer: string;
}

const AI_INFRA: InsightChain = {
  slug: "ai-infra",
  title: "AI 推理基础设施 · 因果链",
  updatedAt: "2026-07-02",
  event:
    "英伟达季度财报上调数据中心收入指引,叠加新一代推理模型发布带动「单位算力 token 成本明显下降」——即一次「模型能力跃迁 / 推理成本↓」型全球事件,触发「推理成本↓→调用量↑」向 AI 推理基础设施全链外溢。",
  eventNote:
    "占位演示事件,仅用于展示因果链结构。上线须替换为当下已发生的真实公告/财报/纪要,并回原始来源核对具体口径与数字。",
  whyThisEvent:
    "本链差异化不在「画一张 AI 产业链图」,而在这一个事件的具体 delta 如何改变各环节排序:本次核心是「推理成本↓ + 推理需求占比提升」→ 权重压在推理侧放量(光互连/服务器/HBM),而非训练侧。若换成「训练集群超大单」事件,重心应偏先进封装/HBM/电力;换成「国产替代政策」事件,重心转向国产算力芯片。红线:若「推理降本」和「训练扩容」两类事件产出同一张热力图,即为「按类别检索预制图谱」,产物不成立。",
  oneLiner:
    "与本类「推理成本↓/模型能力↑」事件产业逻辑关联最紧、证据链相对完整的是「AI 推理基础设施链」。按「传导层级 + 证据完整度」(非推荐顺序、非收益/涨幅排序)排列:光模块/高速互连 ≥ HBM/先进封装 > 液冷/数据中心电力;国产算力芯片(海光/寒武纪)与本次海外事件多属「国产替代的情绪映射」而非直接供货,应以订单兑现等公开信息自行核实。",
  differentiators: [
    "环节放量的传导层级排序(不是罗列,是分级)",
    "个股关系分级:直接 / 间接 / 情绪映射(资讯聚合与「概念板块」给不了)",
    "逐跳置信度 + 诚实自曝(不伪装确定性,标出可能反转的假设)",
  ],
  heatmapNote:
    "口径隔离:此处「升温/降温/分化/承压」= 产业景气/关注度维度,非股价涨跌预测;强度 = 逻辑关联与证据完整度,非收益或涨幅排序。",
  heatmap: [
    { segment: "光模块 / 高速互连(光)", direction: "升温", intensity: 5, reason: "万卡/十万卡集群横向扩展(scale-out)刚性拉动,速率向 800G/1.6T 迭代,北美云厂订单能见度高——本链证据链相对完整、传导最直接的一环" },
    { segment: "存储 / HBM", direction: "升温", intensity: 4, reason: "每颗 AI GPU 强制配套多颗 HBM,出货强绑定 + 持续供不应求。备注:A 股缺真正 HBM 自研标的,本环节无强直接映射" },
    { segment: "先进封装 / 封测", direction: "升温", intensity: 3, reason: "CoWoS/2.5D 是算力供给实际卡点;国产封测受全球 AI 芯片放量 + 国产替代双驱动,业绩兑现需时间" },
    { segment: "液冷 / 温控", direction: "升温", intensity: 3, reason: "单机柜功率顶到风冷极限,液冷由可选变刚需、渗透率抬升;落地与订单确认节奏存在不确定性" },
    { segment: "铜连接 / 高速互连(铜)", direction: "分化", intensity: 3, reason: "GB 系统铜背板放量利好短距 scale-up,但光/铜路线随距离速率存在替代博弈,内部分化" },
    { segment: "数据中心电力 / HVDC", direction: "升温", intensity: 3, reason: "电力从「成本项」变「能否上电」的核心约束;但传导到 A 股电力设备偏间接、噪声大" },
    { segment: "国产算力芯片(GPU/DCU)", direction: "分化", intensity: 3, reason: "国产替代关注度高,但受海外单一事件的直接驱动弱,靠订单兑现区分真伪、波动大" },
    { segment: "服务器 / 算力代工", direction: "升温", intensity: 3, reason: "AI 服务器出货风向标,绑定英伟达/云厂 capex 节奏" },
    { segment: "传统风冷 / 低速互连", direction: "降温", intensity: 2, reason: "被液冷与高速互连结构性替代,长期承压(供参照的承压项)" },
  ],
  hopsNote:
    "结构声明:真正层层递进的推理主链是 Hop1→Hop2(事件→token 放量→capex 上修);下方分支是由「GPU/数据中心↑」扇出的并行资产映射,对本次具体事件的边际敏感度低于主链——不以跳数堆砌伪装深度。",
  mainHops: [
    {
      order: 1,
      from: "模型能力跃迁 / 推理成本↓",
      to: "AI 调用量(token 消耗)↑",
      logic: "单位推理成本下降 + 能力提升,推动应用侧调用频次与场景扩张(杰文斯悖论),总 token 消耗不降反升。边界:需求弹性不足/预算约束/场景不成熟时,并非线性放大。",
      evidenceType: "官方定价页 / 产业数据 / 财报电话会纪要",
      evidenceExample: "模型厂商官方定价页(每百万 token 价格逐代下降)+ 头部 API/云平台月度 token 处理量增速;或财报电话会「推理需求占比提升」原话。引具体数字前须回原始来源核对。",
      confidence: "中",
      caveat: "【全链总闸】「推理成本↓」对硬件是多空分岔:杰文斯放量(多)vs 单位硬件需求下降、硬件毛利承压(空)。若杰文斯不成立(降本主要转化为省钱而非放量),整条链方向反转——这是全链置信度的总闸。",
    },
    {
      order: 2,
      from: "调用量↑",
      to: "数据中心算力 / GPU 采购(capex)↑",
      logic: "推理负载增长需要更多加速卡与集群,北美云厂上修资本开支承接需求。",
      evidenceType: "财报 / 官方 capex 指引",
      evidenceExample: "微软/谷歌/Meta/亚马逊季报 capex 指引与「AI 及数据中心投入」口径;英伟达数据中心分部收入与下季指引。",
      confidence: "高",
    },
  ],
  branchHops: [
    { order: 3, from: "GPU 需求↑", to: "HBM 高带宽存储需求↑", logic: "每颗 AI GPU 强制配套多颗 HBM,近似线性绑定,HBM 持续供不应求。", evidenceType: "存储厂财报 / 第三方需求预测", evidenceExample: "美光、SK 海力士财报「HBM 产能已售罄/年度产能预定」与扩产计划。", confidence: "高" },
    { order: 4, from: "GPU/HBM 需求↑", to: "先进封装(CoWoS/2.5D)产能瓶颈↑", logic: "HBM 与逻辑 die 集成依赖 CoWoS,封装产能而非晶圆前道往往是算力供给实际卡点。", evidenceType: "代工/封测法说会", evidenceExample: "台积电法说会 CoWoS 扩产表述;OSAT(日月光、Amkor)先进封装稼动率。", confidence: "高" },
    { order: 5, from: "GPU 功耗/机柜密度↑", to: "液冷/温控渗透率↑", logic: "单机柜功率跃升至风冷极限之上,液冷由可选变刚需。渗透节奏与建设周期存在不确定性,不宜线性外推。", evidenceType: "官方 datasheet / 方案商订单", evidenceExample: "英伟达 GB 系列机柜整机功率官方 datasheet;Vertiv 等液冷渗透率/在手订单。", confidence: "中" },
    { order: 6, from: "算力集群规模↑(scale-out)", to: "光模块/高速互连需求↑", logic: "万卡/十万卡集群横向扩展,GPU:光模块配比抬升,速率向 800G/1.6T 迭代。", evidenceType: "光模块厂财报 / 速率路线图", evidenceExample: "中际旭创、新易盛季报高速率光模块收入占比与北美客户结构。", confidence: "高" },
    { order: 7, from: "机柜内 scale-up 互连", to: "高速铜连接需求↑", logic: "机柜内短距高速互连以铜缆为主,GB 系统铜背板放量;但光/铜边界随距离与速率变化,存在替代博弈。", evidenceType: "官方规格 / 客户验证纪要", evidenceExample: "英伟达 NVLink 铜背板规格;高速铜缆/AEC 客户验证与订单进展。", confidence: "中", caveat: "需警惕拥挤交易与路线切换风险。" },
    { order: 8, from: "数据中心规模↑", to: "电力供给/供配电(HVDC/变压器)约束↑", logic: "算力集群总功率激增,电力从「成本项」升级为「能否上电」的核心约束。传导到 A 股电力设备属较间接一层。", evidenceType: "用电增速 / 供配电订单", evidenceExample: "云厂/电网数据中心用电增速;Vertiv、Eaton 供配电订单积压。", confidence: "中" },
  ],
  mappingNote:
    "每条均为「研究框架梳理·非确认关系」,不构成对该证券的推荐或买卖建议;所列个股仅为产业链关联的说明性示例。relation(直接/间接/情绪映射)= 产业链传导层级(供货/配套距离),不代表受益程度或收益确定性。",
  mappings: [
    { name: "中际旭创", code: "300308", segment: "光模块/高速互连", relation: "直接", reason: "全球光模块龙头,英伟达及北美四大云厂核心供应商,与 scale-out 扩展及速率迭代强绑定", confidence: "高" },
    { name: "新易盛", code: "300502", segment: "光模块/高速互连", relation: "直接", reason: "北美云厂 800G/1.6T 主力二供,海外订单占比高,映射海外算力 capex", confidence: "高" },
    { name: "天孚通信", code: "300394", segment: "光模块/高速互连", relation: "间接", reason: "向旭创/新易盛/Fabrinet 供光器件与光引擎,平台型上游配套;对海外事件是上游一层传导", confidence: "中" },
    { name: "工业富联", code: "601138", segment: "服务器/算力代工", relation: "直接", reason: "全球 AI 服务器代工龙头,绑定英伟达/云厂出货,GPU capex 出货风向标", confidence: "高" },
    { name: "海光信息", code: "688041", segment: "国产算力芯片", relation: "情绪映射", reason: "国产 CPU/DCU 替代标的,不直接给英伟达供货;与海外 AI 景气属国产替代的间接关联,建议以公开订单/收入数据自行核实", confidence: "中" },
    { name: "寒武纪", code: "688256", segment: "国产算力芯片", relation: "情绪映射", reason: "国产 AI 芯片纯标的,靠国产订单放量而非海外事件直接驱动,属高波动标的", confidence: "中" },
    { name: "澜起科技", code: "688008", segment: "服务器内存接口/DDR5", relation: "间接", reason: "内存接口芯片(RCD/DB)全球龙头,驱动是 DDR5 渗透与 AI 服务器内存用量提升;HBM 集成在 GPU 封装内、不走澜起链路,不宜按 HBM 暴露理解", confidence: "中" },
    { name: "香农芯创", code: "300475", segment: "存储/HBM(影子)", relation: "情绪映射", reason: "海力士存储代理,本质为代理业务、非自研 HBM,与 HBM 景气为间接关联;属高波动标的", confidence: "低" },
    { name: "长电科技", code: "600584", segment: "先进封装/封测", relation: "间接", reason: "全球封测龙头,先进封装稼动率随全球 AI 芯片放量;先进封装 AI 暴露占比需核实收入结构,叠加国产替代逻辑", confidence: "中" },
    { name: "通富微电", code: "002156", segment: "先进封装/封测", relation: "间接", reason: "深度绑定 AMD,先进封装与 AI 芯片封测订单,受海外 AI 放量间接带动", confidence: "中" },
    { name: "英维克", code: "002837", segment: "液冷/温控", relation: "间接", reason: "数据中心液冷龙头,受液冷渗透率提升带动;下游以国内数据中心为主,与海外事件隔一层", confidence: "中" },
    { name: "沃尔核材", code: "002130", segment: "铜连接/高速互连", relation: "间接", reason: "市场预期其受 GB 系统铜连接放量带动(供货关系待订单/公告验证);属高波动标的", confidence: "中" },
    { name: "电连技术", code: "300679", segment: "铜连接/高速互连", relation: "情绪映射", reason: "主业消费电子/汽车连接器,AI 高速铜缆(对标 AEC)为新拓展、收入占比小、GB 系统供货未见确认,需盯客户验证", confidence: "低" },
    { name: "盛弘股份", code: "300693", segment: "数据中心电力/HVDC", relation: "间接", reason: "数据中心 HVDC/电力电子;DC 电源为其二线分部(主业充电桩/储能/电能质量),收入结构占比待验证", confidence: "中" },
    { name: "科士达", code: "002518", segment: "数据中心电力/HVDC", relation: "间接", reason: "数据中心 UPS/供配电 + 储能,受数据中心电力订单带动", confidence: "中" },
    { name: "东方电气", code: "600875", segment: "数据中心电力/发电", relation: "情绪映射", reason: "重型燃机/核电/发电装备,承接「算力耗电→发电需求」宏大叙事;传导链最长、映射最弱,本质是能源股,需订单/收入结构验证", confidence: "低" },
  ],
  uncertainties: [
    "Hop1 是全链总闸:杰文斯悖论若不成立,方向反转——最需盯的假设。",
    "Hop5/7/8 节奏不确定:液冷渗透、光/铜替代边界、电力→A 股电力设备传导,均不宜线性外推。",
    "国产算力芯片(海光/寒武纪)刻意标「情绪映射」:它们不直接给英伟达供货,若被读成直接受益会严重失真。",
    "弱映射如实呈现:香农芯创(代理)、东方电气(发电)关系偏弱、置信度低,放进来是为诚实展示「弱映射长什么样」。",
    "price-in 未校验:A 股光模块龙头是否已被资金充分定价,需结合当日行情与资金面再核。",
  ],
  disclaimer:
    "本内容为 AI 推理基础设施产业链的关联梳理,基于公开、公认的行业因果逻辑与证据类型示例;「证据举例」仅说明真实上线时应引用何种来源,不含真实实时数字与 URL,种子事件为占位演示需替换为当日真事件。文中所有关系均为「关联/映射/受影响」,属非确认因果关系、仅统计非预测,不构成任何投资建议、不含买卖指令、目标价或涨跌预测。多跳链为「逻辑 + 证据」框架,非回测统计胜率。本工具不提供证券投资咨询服务,所列个股仅为产业链关联的说明性示例,不构成任何推荐;个股波动风险自负。",
};

export const INSIGHT_CHAINS: Record<string, InsightChain> = {
  [AI_INFRA.slug]: AI_INFRA,
};
