// 推理链(ReasoningChain)种子数据 —— 内核"最小可证"实验:一条 AI 推理基础设施因果链。
// 隔离、纯加法:只被 /insight/[slug] 页读取,不进导航/首页,不改任何现有页面。删掉本文件+路由即回到现状。
// 定稿来源:docs/min-proof-ai-chain-2026-07-02.md(多专家起草 + 三路对抗评审)。
// 产品化原则:①人话为主(给散户科普)、专业为辅;②三层——首屏卡(10秒)/热力+因果(1分钟)/深度核验;
//   ③合规:启动期从宽但定位不变——关系分级、非推荐、无买卖/目标价;个股仅为产业链关联的说明性示例。

export type Confidence = "高" | "中" | "低" | "假设";
export type HeatDir = "升温" | "降温" | "分化" | "中性";
export type Relation = "直接" | "间接" | "情绪映射" | "弱";

export interface Hop {
  order: number;
  from: string;
  to: string;
  plain: string; // 人话(散户能懂)——主展示
  logic: string; // 专业逻辑——次要/深度
  evidenceType: string;
  evidenceExample?: string;
  confidence: Confidence;
  caveat?: string; // 证伪/空头读法(专业)
  caveatPlain?: string; // 证伪的人话版
}
export interface HeatRow {
  segment: string;
  plain: string; // 这个环节是啥(人话)
  direction: HeatDir;
  intensity: number; // 1-5,逻辑关联+证据完整度(非收益/涨幅)
  relation?: Relation; // 与本次事件的传导层级
  confidence?: Confidence;
  hopOrder?: number; // 关联的因果链分支跳(「怎么传到这的」折叠进该热力行,热力图=第二层唯一骨架)
  reason: string; // 专业原因
}
export interface StockMap {
  name: string;
  code?: string; // 有则跳个股页(且需在股池内)
  segment: string;
  relation: Relation; // 传导层级(供货/配套距离),非受益程度
  relationNote?: string; // 关系标后缀(如应用链间接标的加「自身商业化可验证」,防误读成海外传导)
  reason: string;
  confidence: Confidence;
}
export interface InsightChain {
  slug: string;
  title: string;
  updatedAt: string;
  event: string;
  eventNote: string; // 占位说明
  // 首屏 10 秒懂(极简,像张图一眼扫完;术语一律不上首屏)
  tldr: {
    hook: string; // 一句大白话:这事是啥、看什么(禁资金/买卖暗示)
    tiers: { emoji: string; level: string; what: string; why: string; rel?: Relation }[]; // 强弱三档;rel=锚到对应映射分组
    risk: string; // 一句话最大风险
  };
  // 结论:人话版=分享卡 canonical 文案(渲染在深度层);专业版=合规完整口径
  oneLinerPlain: string;
  oneLiner: string;
  // 「简单说」:整条传导故事,一行一句人话;「专业上」:一行对应的专业口径(人话为主,专业为辅的范式)
  eventPlain: string; // 事件本身(人话)
  storyPlain: string[];
  storyPro: string;
  differentiators: string[]; // 强于聚合的差异点(深度)
  whyThisEvent: string; // 反换皮方法论(深度/muted)
  heatmapNote: string;
  heatmap: HeatRow[];
  hopsNote: string;
  mainHops: Hop[];
  branchHops: Hop[];
  mappingNote: string;
  mappings: StockMap[];
  uncertainties: string[]; // 已知不确定性(深度)
  // 去哪核实:kind=具体来源(真实文档/披露页,URL 已实测可达)或 常设入口(官方 IR/定价页);
  // supports=这条来源支撑推理链的哪一跳/哪个环节(评审拍板:references 要对得上跳)。
  // 正式上线时每跳另挂当天具体来源+时间戳(1.0=具体季报/公告段落+具体日期)。绝不编造链接。
  references: { kind: "具体来源" | "常设入口"; name: string; url: string; type: string; note: string; date?: string; supports?: string }[];
  disclaimer: string;
}

const AI_INFRA: InsightChain = {
  slug: "ai-infra",
  title: "AI 推理基础设施 · 因果链",
  // ⚠️ 模板规则:凡改本文件内容(文案/结构/references),必须同步 bump updatedAt——
  // 页头"更新 X"和免责句承诺的「更新时间」都指着它,内容动了日期不动=自打脸。
  updatedAt: "2026-07-03",
  event:
    "英伟达季度财报上调数据中心收入指引,叠加新一代推理模型发布带动「单位算力 token 成本明显下降」——即一次「模型能力跃迁 / 推理成本↓」型全球事件。",
  eventNote:
    "示例事件:这类「AI 变便宜」的事历史上反复发生(历代模型发布/降价);正式上线会换成当天真实公告并核对数字。",

  tldr: {
    hook: "AI 要是算得更便宜了(比如 GPT-6 这种大事)——最先传到产业链的哪几段?一眼看懂 👇",
    tiers: [
      { emoji: "🔥", level: "最直接", what: "光模块 · 快内存(HBM)", rel: "直接", why: "AI 用得越多,传数据、存数据的需求越猛" },
      { emoji: "🌡️", level: "跟着热", what: "液冷 · 供电 · 先进封装", rel: "间接", why: "机器堆多了,散热、供电、封装跟着忙" },
      { emoji: "💨", level: "沾光为主", what: "国产 AI 芯片(海光 · 寒武纪)", rel: "情绪映射", why: "更多是 AI 热度和国产替代情绪,真受益要看自己的订单" },
    ],
    risk: "前提是大家真的会更多地用 AI。如果「变便宜」只是帮微软、谷歌这些云计算大厂省了钱、没带来更多使用,这条链的利好就打折。",
  },

  oneLinerPlain:
    "这种「AI 算得更便宜」的事,最先带火的是数据中心里机器之间高速传数据的「光接头(光模块)」和贴着芯片的「快内存(HBM)」;其次是给机器降温的「液冷」和「供电」;国产 AI 芯片(海光、寒武纪)更多是股价沾光,真金白银还得看订单。",
  oneLiner:
    "与本类「推理成本↓/模型能力↑」事件产业逻辑关联最紧、证据链相对完整的是「AI 推理基础设施链」。按「传导层级 + 证据完整度」(非推荐顺序、非收益/涨幅排序):光模块/高速互连 ≥ HBM/先进封装 > 液冷/数据中心电力;国产算力芯片(海光/寒武纪)与本次海外事件多属「国产替代的情绪映射」而非直接供货,应以订单兑现等公开信息自行核实。",
  eventPlain:
    "英伟达最新财报说数据中心生意比预期还好;同时新一代推理模型发布,AI「算一次」的成本明显下降。",
  storyPlain: [
    "如果 AI 变便宜,大家可能会用得更多。",
    "用得更多,就需要更多数据中心算力。",
    "数据中心越大,机器之间传数据越多——所以光模块和高速互连最先受影响。",
    "快内存(HBM)、先进封装、液冷、电力设备也会被带动。",
    "但国产算力芯片更多是沾光(情绪映射),不是这类海外事件的直接受益方。",
  ],
  storyPro:
    "专业上,这对应:推理成本下降、token 消耗增长、云厂 capex 上修、scale-out 网络需求提升。",

  differentiators: [
    "环节放量的传导层级排序(不是罗列,是分级)",
    "个股关系分级:直接 / 间接 / 情绪映射(资讯聚合与「概念板块」给不了)",
    "逐跳置信度 + 诚实自曝(不伪装确定性,标出可能反转的假设)",
  ],
  whyThisEvent:
    "本链差异化不在「画一张 AI 产业链图」,而在这一个事件的具体 delta 如何改变各环节排序:本次核心是「推理成本↓ + 推理需求占比提升」→ 权重压在推理侧放量(光互连/服务器/HBM)。若换成「训练集群超大单」事件,重心偏先进封装/HBM/电力;换成「国产替代政策」事件,重心转向国产算力芯片。红线:若两类事件产出同一张热力图,即为「按类别检索预制图谱」,产物不成立。",

  heatmapNote:
    "「升温/降温/分化」= 产业景气/关注度,非股价涨跌预测;强度 = 逻辑关联与证据完整度,非收益或涨幅排序。",
  heatmap: [
    { segment: "光模块 / 高速互连", plain: "数据中心里机器之间高速传数据的「光接头」", direction: "升温", intensity: 5, relation: "直接", confidence: "高", hopOrder: 6, reason: "万卡/十万卡集群横向扩展(scale-out)刚性拉动,速率向 800G/1.6T 迭代,北美云厂订单能见度高——本链证据链最完整、传导最直接的一环" },
    { segment: "存储 / HBM", plain: "贴着 AI 芯片的「快内存」", direction: "升温", intensity: 4, relation: "直接", confidence: "高", hopOrder: 3, reason: "每颗 AI GPU 强制配套多颗 HBM,出货强绑定 + 持续供不应求。备注:A 股缺真正 HBM 自研标的,本环节无强直接映射" },
    { segment: "先进封装 / 封测", plain: "把芯片和内存「叠装」在一起的高级工艺", direction: "升温", intensity: 3, relation: "间接", confidence: "中", hopOrder: 4, reason: "CoWoS/2.5D 是算力供给实际卡点;国产封测受全球 AI 芯片放量 + 国产替代双驱动,业绩兑现需时间" },
    { segment: "液冷 / 温控", plain: "机器太热,用液体给它降温", direction: "升温", intensity: 3, relation: "间接", confidence: "中", hopOrder: 5, reason: "单机柜功率顶到风冷极限,液冷由可选变刚需、渗透率抬升;落地与订单确认节奏存在不确定性" },
    { segment: "铜连接 / 高速互连(铜)", plain: "机柜里近距离连接用的「铜线」", direction: "分化", intensity: 3, relation: "间接", confidence: "中", hopOrder: 7, reason: "GB 系统铜背板放量利好短距 scale-up,但光/铜路线随距离速率存在替代博弈,内部分化" },
    { segment: "数据中心电力 / 供配电", plain: "给数据中心供电、配电的设备", direction: "升温", intensity: 3, relation: "间接", confidence: "中", hopOrder: 8, reason: "电力从「成本项」变「能否上电」的核心约束;但传导到 A 股电力设备偏间接、噪声大" },
    { segment: "国产算力芯片", plain: "国产的 AI 芯片(对标英伟达)", direction: "分化", intensity: 3, relation: "情绪映射", confidence: "中", reason: "国产替代关注度高,但受海外单一事件的直接驱动弱,靠订单兑现区分真伪、波动大" },
    { segment: "服务器 / 算力代工", plain: "组装 AI 服务器的厂", direction: "升温", intensity: 3, relation: "直接", confidence: "高", reason: "AI 服务器出货风向标,绑定英伟达/云厂 capex 节奏" },
    { segment: "传统风冷 / 低速互连", plain: "老式风扇散热 / 慢速连接(在被替代)", direction: "降温", intensity: 2, relation: "弱", confidence: "低", reason: "被液冷与高速互连结构性替代,长期承压(供参照的承压项)" },
  ],

  hopsNote:
    "后面的光模块、快内存、液冷、电力,是被「云厂加大投入」一起带起来的分支,不是硬串的长链。",
  mainHops: [
    {
      order: 1,
      from: "AI 算得更便宜 / 更强",
      to: "大家可能用得更多(算力消耗↑)",
      plain: "AI 算一次答案越来越便宜了——便宜了大家可能就用得更凶(像流量降价后刷视频更多),总的算力消耗反而上去。",
      logic: "单位推理成本下降 + 能力提升,推动应用侧调用频次与场景扩张(杰文斯悖论),总 token 消耗不降反升。边界:需求弹性不足/预算约束/场景不成熟时,并非线性放大。",
      evidenceType: "官方定价页 / 产业数据 / 财报电话会纪要",
      evidenceExample: "模型厂商官方定价页(每百万 token 价格逐代下降)+ 头部 API/云平台月度 token 处理量增速。引具体数字前须回原始来源核对。",
      confidence: "中",
      caveat: "【全链总闸】「推理成本↓」对硬件是多空分岔:杰文斯放量(多)vs 单位硬件需求下降、硬件毛利承压(空)。若杰文斯不成立,整条链方向反转。",
      caveatPlain: "但也可能只是「省了钱、没多用」——那这条链就反过来变利空,这是最该盯的一步。",
    },
    {
      order: 2,
      from: "用得更多",
      to: "数据中心加大投入买芯片(云厂 capex↑)",
      plain: "用得多了,几大云厂(微软/谷歌/亚马逊)就得买更多 AI 芯片、建更多数据中心。",
      logic: "推理负载增长需要更多加速卡与集群,北美云厂上修资本开支承接需求。",
      evidenceType: "财报 / 官方 capex 指引",
      evidenceExample: "微软/谷歌/Meta/亚马逊季报 capex 指引;英伟达数据中心分部收入与下季指引。",
      confidence: "高",
    },
  ],
  branchHops: [
    { order: 3, from: "买更多 AI 芯片", to: "超高速内存(HBM)需求↑", plain: "每张 AI 芯片都要配一堆「超高速内存(HBM)」,芯片卖得多,HBM 就抢手。", logic: "每颗 AI GPU 强制配套多颗 HBM,近似线性绑定,持续供不应求。", evidenceType: "存储厂财报 / 需求预测", evidenceExample: "美光、SK 海力士财报「HBM 产能已售罄/年度预定」与扩产计划。", confidence: "高" },
    { order: 4, from: "芯片+内存要集成", to: "先进封装产能吃紧↑", plain: "把芯片和内存「叠装」在一起的高级封装工艺,是产能卡脖子的地方,跟着吃紧。", logic: "HBM 与逻辑 die 集成依赖 CoWoS,封装产能而非晶圆前道往往是算力供给实际卡点。", evidenceType: "代工/封测法说会", evidenceExample: "台积电法说会 CoWoS 扩产表述;OSAT 先进封装稼动率。", confidence: "高" },
    { order: 5, from: "机器越堆越热", to: "液冷降温需求↑", plain: "机器越堆越密、越来越烫,风扇吹不动了,只能改用「液体降温(液冷)」。", logic: "单机柜功率跃升至风冷极限之上,液冷由可选变刚需。渗透节奏与建设周期存在不确定性。", evidenceType: "官方 datasheet / 方案商订单", evidenceExample: "英伟达 GB 系列机柜整机功率 datasheet;Vertiv 液冷渗透率/在手订单。", confidence: "中" },
    { order: 6, from: "机器连成一大片一起算", to: "光模块/高速互连需求↑", plain: "机器多了要连成一大片一起算,机器之间靠「光接头(光模块)」高速传数据,需求跟着放量。", logic: "万卡/十万卡集群横向扩展,GPU:光模块配比抬升,速率向 800G/1.6T 迭代。", evidenceType: "光模块厂财报 / 速率路线图", evidenceExample: "中际旭创、新易盛季报高速率光模块收入占比与北美客户结构。", confidence: "高" },
    { order: 7, from: "机柜内近距离连接", to: "高速铜连接需求↑", plain: "机柜里近距离连接主要用「铜线」,也跟着放量;但光和铜谁用得多有博弈。", logic: "机柜内短距高速互连以铜缆为主,GB 系统铜背板放量;光/铜边界随距离速率变化。", evidenceType: "官方规格 / 客户验证纪要", evidenceExample: "英伟达 NVLink 铜背板规格;高速铜缆/AEC 客户验证进展。", confidence: "中", caveat: "存在替代博弈,需警惕拥挤交易与路线切换风险。", caveatPlain: "光和铜在抢地盘,押错路线会踩坑。" },
    { order: 8, from: "这么多机器一起转", to: "供电/配电设备需求↑", plain: "这么多机器一起转最耗电,「能不能供上电」成了硬约束,供配电设备跟着受关注。", logic: "算力集群总功率激增,电力从「成本项」升级为「能否上电」的核心约束。传导到 A 股电力设备属较间接一层。", evidenceType: "用电增速 / 供配电订单", evidenceExample: "云厂/电网数据中心用电增速;Vertiv、Eaton 供配电订单积压。", confidence: "中" },
  ],

  mappingNote:
    "每条均为「研究框架梳理·非确认关系」,不构成对该证券的推荐或买卖建议;所列个股仅为产业链关联的说明性示例。关系(直接/间接/情绪映射)= 产业链传导层级(供货/配套距离),不代表受益程度。",
  mappings: [
    { name: "中际旭创", code: "300308", segment: "光模块/高速互连", relation: "直接", reason: "全球光模块龙头,英伟达及北美四大云厂核心供应商,AI 数据中心网络升级的短传导环节;后续看 800G/1.6T 订单、海外云厂客户导入、收入占比与毛利率。", confidence: "高" },
    { name: "新易盛", code: "300502", segment: "光模块/高速互连", relation: "直接", reason: "北美云厂 800G/1.6T 主力二供,海外订单占比高,映射海外算力投入", confidence: "高" },
    { name: "天孚通信", code: "300394", segment: "光模块/高速互连", relation: "间接", reason: "向旭创/新易盛/Fabrinet 供光器件与光引擎,是「供应商的供应商」,对海外事件隔一层传导", confidence: "中" },
    { name: "工业富联", code: "601138", segment: "服务器/算力代工", relation: "直接", reason: "全球 AI 服务器代工龙头,绑定英伟达/云厂出货,是 capex 出货的风向标", confidence: "高" },
    { name: "海光信息", code: "688041", segment: "国产算力芯片", relation: "情绪映射", reason: "国产 CPU/DCU 替代标的,不直接给英伟达供货;与海外 AI 景气属国产替代的间接关联,建议看公开订单/收入自行核实", confidence: "中" },
    { name: "寒武纪", code: "688256", segment: "国产算力芯片", relation: "情绪映射", reason: "国产 AI 芯片纯标的,靠国产订单放量而非海外事件直接驱动,属高波动标的", confidence: "中" },
    { name: "澜起科技", code: "688008", segment: "服务器内存接口/DDR5", relation: "间接", reason: "内存接口芯片龙头,驱动是 DDR5 渗透与 AI 服务器内存用量;注意 HBM 集成在 GPU 封装内、不走它,别按 HBM 理解", confidence: "中" },
    { name: "香农芯创", code: "300475", segment: "存储代理(HBM影子)", relation: "情绪映射", reason: "海力士存储代理,本质是代理生意、非自研 HBM,与 HBM 景气仅间接关联;高波动", confidence: "低" },
    { name: "长电科技", code: "600584", segment: "先进封装/封测", relation: "间接", reason: "全球封测龙头,先进封装稼动率随全球 AI 芯片放量;AI 暴露占比需核实收入结构,叠加国产替代", confidence: "中" },
    { name: "通富微电", code: "002156", segment: "先进封装/封测", relation: "间接", reason: "深度绑定 AMD,先进封装与 AI 芯片封测订单,受海外 AI 放量间接带动", confidence: "中" },
    { name: "英维克", code: "002837", segment: "液冷/温控", relation: "间接", reason: "数据中心液冷龙头,受液冷渗透率提升带动;下游以国内数据中心为主,与海外事件隔一层", confidence: "中" },
    { name: "沃尔核材", code: "002130", segment: "铜连接/高速互连", relation: "间接", reason: "市场预期其受 GB 系统铜连接放量带动(供货关系待订单/公告验证);高波动", confidence: "中" },
    { name: "电连技术", code: "300679", segment: "铜连接/高速互连", relation: "情绪映射", reason: "主业消费电子/汽车连接器,AI 高速铜缆为新拓展、收入占比小、供货未见确认,需盯客户验证", confidence: "低" },
    { name: "盛弘股份", code: "300693", segment: "数据中心电力", relation: "间接", reason: "数据中心 HVDC/电力电子;但 DC 电源为其二线分部(主业充电桩/储能),占比待验证", confidence: "中" },
    { name: "科士达", code: "002518", segment: "数据中心电力", relation: "间接", reason: "数据中心 UPS/供配电 + 储能,受数据中心电力订单带动", confidence: "中" },
    { name: "东方电气", code: "600875", segment: "数据中心电力/发电", relation: "情绪映射", reason: "发电装备,承接「算力耗电→发电需求」宏大叙事;传导链最长、映射最弱,本质是能源股", confidence: "低" },
  ],

  uncertainties: [
    "液冷渗透、光/铜替代边界、电力→A 股电力设备传导,节奏都不确定,不宜线性外推。",
    "国产算力芯片(海光/寒武纪)刻意标「情绪映射」:它们不直接给英伟达供货,若读成直接受益会严重失真。",
    "香农芯创(代理)、东方电气(发电)关系偏弱、置信度低,放进来是为诚实展示「弱映射长什么样」。",
    "有没有被资金提前炒过头(price-in)没校验,需结合当日行情与资金面再看。",
  ],
  references: [
    { kind: "具体来源", date: "2025-11-19", name: "英伟达 2026 财年 Q3 财报新闻稿", url: "https://nvidianews.nvidia.com/news/nvidia-announces-financial-results-for-third-quarter-fiscal-2026", type: "事件来源", supports: "事件本身 · 主线第2步(算力需求还在涨)", note: "数据中心分部收入与下季指引原文(本演示事件的原型)" },
    { kind: "具体来源", date: "2025-10", name: "微软 2026 财年 Q1 业绩发布页", url: "https://www.microsoft.com/en-us/investor/earnings/FY-2026-Q1/press-release-webcast", type: "云厂 capex", supports: "主线第2步(云厂买更多芯片、建更多数据中心)", note: "云厂资本开支与「AI/数据中心投入」口径(Alphabet/Meta/亚马逊同理)" },
    { kind: "具体来源", name: "中际旭创 · 巨潮资讯法定披露页", url: "http://www.cninfo.com.cn/new/disclosure/stock?stockCode=300308", type: "光模块厂财报", supports: "光模块环节 · 直接相关票的订单验证", note: "定期报告与业绩/订单公告原文,以此为准" },
    { kind: "常设入口", name: "OpenAI 官方定价页", url: "https://openai.com/api/pricing/", type: "官方定价", supports: "主线第1步(AI 算一次更便宜)", note: "核实「AI 算一次更便宜」:每百万 token 价格逐代变化" },
    { kind: "常设入口", name: "美光投资者关系", url: "https://investors.micron.com", type: "财报", supports: "HBM/存储环节", note: "HBM 产能与预定情况(SK 海力士同理)" },
    { kind: "常设入口", name: "台积电投资者关系(法说会)", url: "https://investor.tsmc.com", type: "法说会", supports: "先进封装(CoWoS)环节", note: "CoWoS 先进封装扩产表述" },
  ],
  disclaimer:
    "本内容为 AI 推理基础设施产业链的关联梳理,基于公开、公认的行业因果逻辑。当前页面包含部分已核实官方来源和部分常设核验入口;演示事件仍为样板事件,正式上线时会替换为当天真实事件,并为每一跳补充具体来源、发布时间、引用字段和更新时间。文中所有关系均为「关联/映射/受影响」,属非确认因果关系、仅统计非预测,不构成任何投资建议、不含买卖指令、目标价或涨跌预测。多跳链为「逻辑 + 证据」框架,非回测统计胜率。本工具不提供证券投资咨询服务,所列个股仅为产业链关联的说明性示例,不构成任何推荐;个股波动风险自负。",
};

// ============================================================================
// 数据中心电力链(第二条手工 insight;负责人 2026-07-03 拍板方向,沿用 ai-infra 模板)。
// 核心边界:该链核心是「数据中心的供配电与散热基础设施」,不是泛电力行业;
// 缺数据中心订单验证的电力题材标情绪映射/弱。所有 A 股映射均取自 stocks.ts 池内真实标的。
// ============================================================================
const DATACENTER_POWER: InsightChain = {
  slug: "datacenter-power",
  title: "AI 数据中心扩张,为什么会传导到电力设备链?",
  updatedAt: "2026-07-03",
  event:
    "云厂商上修数据中心资本开支,叠加新一代 AI 服务器单机柜功率密度大幅提升(数十 kW 级),供配电与散热由配套项变成数据中心新瓶颈——即一次「AI 数据中心扩张 / 功率密度提升」型结构性事件。",
  eventNote:
    "示例事件:这类「数据中心扩张 + 单机柜功率飙升」持续发生(GB 系列高功率服务器、液冷渗透);正式上线会换成当天真实公告(云厂 capex 指引 / 具体数据中心项目)并核对数字。",

  tldr: {
    hook: "AI 数据中心越建越多、单个机柜越来越费电——这股需求会先传到哪几段电力和散热设备?一眼看懂 👇",
    tiers: [
      { emoji: "🔥", level: "最直接", what: "供配电 · UPS · 数据中心温控/液冷", rel: "直接", why: "机房要稳定供电、配电、散热——这些是数据中心的刚需硬件" },
      { emoji: "🌡️", level: "跟着热", what: "液冷配套 · 储能 · 输配电", rel: "间接", why: "功率上来了,液冷配套、储能备电、电网侧跟着忙" },
      { emoji: "💨", level: "沾光为主", what: "发电 · 核电 · 泛电力题材", rel: "情绪映射", why: "「算力耗电」是宏大叙事,但离数据中心订单最远,多是主题带动" },
    ],
    risk: "如果 AI 数据中心扩张只停在规划和资本开支预期、没落到订单/交付/收入确认,这条电力设备链的映射强度就要打折。记住:这个链的核心不是电力行业,而是数据中心的供配电与能效基础设施。",
  },

  oneLinerPlain:
    "这种「AI 数据中心扩张 + 单机柜功率飙升」的事,最先带动的是给机房稳定供电的「供配电 / UPS / HVDC」和给它降温的「数据中心专用温控 / 液冷」;其次是液冷配套、储能和输配电;发电、核电这些离数据中心订单最远,更多是「算力耗电」的情绪带动。",
  oneLiner:
    "与本类「数据中心扩张 / 功率密度提升」事件业务暴露最明确的是「数据中心供配电与能效基础设施链」。按「业务暴露 + 订单可验证性」(非推荐、非收益排序):数据中心供配电 / UPS / HVDC ≈ 数据中心专用温控 / 液冷(直接业务暴露) > 液冷配套 / 储能 / 输配电(间接) > 发电 / 核电(承接「算力耗电」宏大叙事,传导链最长、映射最弱,本质是能源股)。核心边界:该链核心是数据中心的供配电与散热基础设施,非泛电力行业;缺数据中心订单验证的电力题材不计入直接。",
  eventPlain:
    "云厂商在加大数据中心投入,新一代 AI 服务器一个机柜的耗电和发热比过去高出好几倍,于是稳定供电、配电、散热成了数据中心的新瓶颈。",
  storyPlain: [
    "AI 用得越多,云厂商和大模型公司就要建更多、更大的数据中心。",
    "新一代 AI 服务器一个机柜的功率密度飙升,一个机柜顶过去好几个。",
    "机柜越密越费电,稳定供电、配电、UPS 成了刚需——供配电设备最先受影响。",
    "机柜越热,风冷扛不住,液冷和数据中心专用温控跟着上。",
    "再往外,储能、输配电、电网侧跟着扩容;但发电、核电离数据中心订单最远,多是沾「算力耗电」的热度。",
  ],
  storyPro:
    "专业上,这对应:数据中心 capex 上修、单机柜功率密度提升(数十 kW)、风冷→液冷渗透率抬升、HVDC / 巴拿马电源等高效供配电方案渗透,以及数据中心 PUE / 能效约束。",

  differentiators: [
    "环节按「业务暴露 + 订单可验证」分级排序(不是把泛电力股罗列)",
    "个股关系分级:直接(数据中心供配电/温控明确业务)/ 间接(储能/输配电)/ 情绪映射(发电/核电)——资讯的「电力 + AI」概念给不了这种切分",
    "明确划界:核心是数据中心供配电与散热,不是电力行业;缺订单验证的题材标情绪映射/弱",
  ],
  whyThisEvent:
    "这条链是 AI 基础设施的【外溢链】,不是 AI 主链本身——它关注 AI 数据中心扩张后对供配电、温控、液冷、备用电源和电网侧的传导,和 AI 主链(算力/模型/光模块)是两条链、可关联不混同。本链差异化不在「画一张电力设备图」,而在这一个事件的具体 delta 如何改变各环节排序:本次核心是「数据中心功率密度提升 + capex 上修」→ 权重压在数据中心侧的供配电 / UPS / 温控 / 液冷。若换成「电网新能源消纳」事件,重心转向储能 / 特高压 / 电网数字化,与数据中心链是两条链。红线:若「数据中心扩张」与「电网新能源」两类事件产出同一张热力图,即为按类别检索预制图谱,产物不成立。",

  heatmapNote:
    "「升温 / 降温 / 分化 / 中性」= 产业景气 / 业务暴露强弱,非股价涨跌预测;强度 = 业务暴露与证据完整度,非收益或涨幅排序。",
  heatmap: [
    { segment: "数据中心供配电 / UPS / HVDC", plain: "给机房稳定供电、配电、后备电源(UPS)、高效供电(HVDC)", direction: "升温", intensity: 5, relation: "直接", confidence: "中", hopOrder: 3, reason: "机柜功率密度提升下供电与冗余要求抬升,数据中心刚需、业务暴露最明确——本链证据链最完整的一环" },
    { segment: "数据中心温控 / 液冷(专业厂)", plain: "给数据中心降温的专用空调与液冷系统", direction: "升温", intensity: 5, relation: "直接", confidence: "中", hopOrder: 4, reason: "单机柜数十 kW 下风冷触及极限,液冷由可选变刚需;专业厂业务直接绑定数据中心散热" },
    { segment: "液冷配套(CDU / 冷板)", plain: "液冷里的冷板、CDU、管路等配套", direction: "升温", intensity: 4, relation: "间接", confidence: "中", hopOrder: 4, reason: "液冷渗透带动,但数据中心 AI 暴露纯度不一、收入占比与订单节奏待验证" },
    { segment: "变压器 / 干变 / 配电", plain: "数据中心进出电用的变压器和配电", direction: "升温", intensity: 3, relation: "直接", confidence: "中", hopOrder: 5, reason: "数据中心用电大、配电扩容刚需;但也受电网整体需求影响,非纯数据中心" },
    { segment: "服务器电源", plain: "直接给 AI 服务器供电的电源", direction: "升温", intensity: 3, relation: "直接", confidence: "中", reason: "直接给 AI 服务器供电,绑定服务器出货节奏" },
    { segment: "储能 / 备电", plain: "数据中心备用电源与削峰填谷", direction: "分化", intensity: 3, relation: "间接", confidence: "中", hopOrder: 6, reason: "数据中心备电 / 调峰带动,但储能需求多元(电网 / 工商业),非纯数据中心驱动" },
    { segment: "输配电 / 电网侧", plain: "大型数据中心让局部电网扩容", direction: "分化", intensity: 3, relation: "间接", confidence: "中", hopOrder: 7, reason: "数据中心扩容间接带动,主业是电网,隔得更远、噪声大" },
    { segment: "发电 / 核电", plain: "发电装备与核电运营", direction: "中性", intensity: 2, relation: "情绪映射", confidence: "低", reason: "承接「算力耗电→发电需求」宏大叙事,离数据中心订单最远、映射最弱,本质是能源股" },
    { segment: "泛电力题材(无数据中心连接)", plain: "缺数据中心业务的传统电力 / 新能源题材", direction: "中性", intensity: 1, relation: "弱", confidence: "低", reason: "只沾「电力 + AI」概念、无数据中心订单验证(供参照的弱项)" },
  ],

  hopsNote:
    "后面的液冷、储能、输配电,是被「数据中心扩建 + 功率密度提升」一起带起来的分支,不是硬串的长链;发电 / 核电离订单最远。",
  mainHops: [
    {
      order: 1,
      from: "AI 使用增长",
      to: "云厂加大数据中心投资(capex↑)",
      plain: "AI 用得越多,微软 / 谷歌 / 亚马逊 / Meta 这些云厂就要建更多、更大的数据中心。",
      logic: "推理 / 训练负载增长推动云厂上修数据中心资本开支与新建 / 改造规模。",
      evidenceType: "云厂季报 capex 指引",
      evidenceExample: "微软 / 谷歌 / Meta / 亚马逊季报 capex 与「数据中心 / AI 基础设施投入」表述;引具体数字前须回原始来源核对。",
      confidence: "高",
      caveat: "【全链总闸】capex 是「预期」还是「已开工订单」两回事:若停在规划 / 预期、没落到交付与收入,整条设备链映射打折。",
      caveatPlain: "但也可能只是规划和预期、没落到实际开工和订单——那这条链的利好就打折,这是最该盯的一步。",
    },
    {
      order: 2,
      from: "数据中心扩建 + AI 服务器功率密度提升",
      to: "供配电与散热系统整体升级(单机柜数十 kW)",
      plain: "新一代 AI 服务器一个机柜耗电和发热是过去的好几倍,机房的供电、配电和散热必须整体升级。",
      logic: "GB 系列等高功率 AI 服务器推动单机柜功率密度从个位数 kW 升至数十 kW,风冷触及极限、供配电冗余与效率(HVDC)要求提升。",
      evidenceType: "服务器厂 / 数据中心方案商功率密度说明",
      evidenceExample: "NVIDIA GB 系列机柜功率与供电说明;Vertiv / 施耐德数据中心供电与液冷 investor presentation。",
      confidence: "高",
    },
  ],
  branchHops: [
    { order: 3, from: "供电瓶颈", to: "供配电 / UPS / HVDC 需求↑", plain: "机柜越密越费电,稳定供电、配电、UPS 和高效供电(HVDC)成刚需。", logic: "功率密度提升抬升供电冗余与效率要求,HVDC / 巴拿马电源等高效方案渗透。", evidenceType: "数据中心电力方案商披露", evidenceExample: "Vertiv / 施耐德 / 相关 A 股公司数据中心供配电业务与订单表述。", confidence: "高" },
    { order: 4, from: "散热瓶颈", to: "液冷 / 数据中心温控需求↑", plain: "机柜太热风冷扛不住,液冷和数据中心专用温控跟着上。", logic: "单机柜数十 kW 下液冷由可选变刚需,渗透率抬升。", evidenceType: "温控 / 液冷厂披露", evidenceExample: "英维克 / 申菱环境等数据中心液冷业务与渗透率表述。", confidence: "中" },
    { order: 5, from: "配电扩容", to: "变压器 / 干变需求↑", plain: "数据中心用电大,进出的配电和变压器要扩容。", logic: "数据中心配电刚需,但同时受电网整体需求影响。", evidenceType: "变压器 / 配电厂披露", evidenceExample: "金盘科技等干式变压器与数据中心配电业务表述。", confidence: "中" },
    { order: 6, from: "备电 / 调峰", to: "储能被带动(需求多元)", plain: "数据中心要备用电源和削峰,储能被带动,但储能需求不只来自数据中心。", logic: "数据中心备电 / 调峰是储能需求之一,但电网 / 工商业储能占大头。", evidenceType: "储能厂披露", evidenceExample: "科士达 / 科华数据等储能业务与数据中心占比表述。", confidence: "中", caveatPlain: "储能需求多元,别把储能增长直接等同于数据中心订单。" },
    { order: 7, from: "局部电网承压", to: "输配电 / 电网侧间接受益", plain: "大型数据中心让局部电网承压,输配电和电网侧间接受益,但隔得更远。", logic: "数据中心扩容间接抬升局部电网投资,但主业是电网、非数据中心驱动。", evidenceType: "输配电厂披露", evidenceExample: "思源电气等输配电与数据中心相关业务表述。", confidence: "中" },
  ],

  mappingNote:
    "分级标准(见 docs/relation-grading-standard.md 四字段:核心环节 / 数据中心暴露 / AI高功率相关 / 可验证证据):直接=核心环节明确+数据中心暴露明确+传导≤两跳+至少一种可验证证据;间接=环节相关但暴露不纯 / 传导超两跳 / 证据不足 / 偏通用热管理·新能源·工业场景。非推荐、非收益排序,均为 stocks.ts 池内真实标的。⚠️ 当前池内变压器环节先以金盘科技(干式变压器 + 数字化电力设备暴露)作为样本,后续会根据数据中心客户、订单和收入披露继续补充,不代表变压器链仅此一只。",
  mappings: [
    { name: "盛弘股份", code: "300693", segment: "数据中心供配电 / HVDC", relation: "直接", reason: "数据中心 HVDC / 电力电子,对标 Vertiv 电力侧,数据中心供配电业务暴露明确", confidence: "中" },
    { name: "科士达", code: "002518", segment: "UPS / 数据中心电源", relation: "直接", reason: "数据中心 UPS / 供电系统传导距离短,业务暴露明确;看数据中心 UPS 订单、客户结构、收入占比、毛利率", confidence: "中" },
    { name: "英维克", code: "002837", segment: "数据中心液冷 / 温控", relation: "直接", reason: "主营核心业务明确服务数据中心液冷 / 温控,传导路径可从「数据中心功率密度提升→散热系统升级→温控/液冷设备需求」直接解释", confidence: "中" },
    { name: "申菱环境", code: "301018", segment: "数据中心专用温控", relation: "直接", reason: "主营含数据中心专用空调与液冷系统,业务直接绑定数据中心散热,传导路径不超两跳", confidence: "中" },
    { name: "金盘科技", code: "688676", segment: "供配电 / 干式变压器", relation: "直接", reason: "数据中心供配电 / 干式变压器 / 数字化电力设备的直接映射样本;需看数据中心客户、干变订单、数字化电力收入与交付节奏验证(当前池内变压器环节仅此样本,后续按披露补充,详见分级说明)", confidence: "中" },
    { name: "依米康", code: "300249", segment: "数据中心温控 / 机房环境控制", relation: "直接", reason: "数据中心精密空调与机房环境控制属散热基础设施核心环节,传导路径直接;需看数据中心温控订单、客户项目、收入占比验证", confidence: "中" },
    { name: "佳力图", code: "603912", segment: "数据中心精密空调 / 温控", relation: "直接", reason: "机房精密空调是数据中心散热基础设施,传导路径直接;仍需数据中心客户、精密空调订单、收入占比验证", confidence: "中" },
    { name: "中恒电气", code: "002364", segment: "电源 / HVDC", relation: "间接", reason: "HVDC 与数据中心供电系统相关,但仍需通过数据中心客户、项目订单和收入占比验证,先按间接映射处理(证据充分再上调直接)", confidence: "中" },
    { name: "欧陆通", code: "300870", segment: "服务器电源", relation: "间接", reason: "服务器电源属服务器配套,给 AI 服务器供电但机房供配电暴露间接、传导多一跳,数据中心收入占比待验证", confidence: "中" },
    { name: "高澜股份", code: "300499", segment: "液冷", relation: "间接", reason: "纯水冷却 / 液冷,数据中心 AI 暴露纯度与订单验证不足,需更多证据确认", confidence: "中" },
    { name: "同飞股份", code: "300990", segment: "液冷 / CDU", relation: "间接", reason: "冷板及浸没液冷、CDU,数据中心 AI 暴露纯度与收入占比待验证", confidence: "中" },
    { name: "曙光数创", code: "920808", segment: "液冷基础设施", relation: "直接", reason: "浸没液冷基础设施与高功率数据中心散热升级的传导距离较短;不代表一定受益,仍需通过数据中心项目、客户订单和收入占比验证", confidence: "中" },
    { name: "飞荣达", code: "300602", segment: "液冷板 / CDU / 热管理件", relation: "间接", reason: "液冷板、CDU 及热管理器件,偏材料件 / 通用热管理,数据中心 AI 暴露纯度与收入占比待验证", confidence: "低" },
    { name: "科华数据", code: "002335", segment: "UPS / 数据中心电源 / IDC 基础设施", relation: "直接", reason: "UPS / 数据中心电源 / IDC 基础设施业务与数据中心供电传导距离短,可作电力基础设施链直接样本;仍看数据中心客户、UPS 订单、IDC 收入与交付验证", confidence: "中" },
    { name: "思源电气", code: "002028", segment: "输配电 / 储能", relation: "间接", reason: "输配电、储能与数据中心超级电容,主业电网、数据中心为新方向", confidence: "中" },
    { name: "麦格米特", code: "002851", segment: "电源平台", relation: "间接", reason: "电源 + 电控平台,数据中心电源为其分部,占比待验证", confidence: "中" },
    { name: "南都电源", code: "300068", segment: "备用电源 / 储能", relation: "间接", reason: "备用电源与储能可服务数据中心,但非最短传导环节,业务易与泛储能混同;先间接更稳。看数据中心备用电源订单、储能项目客户、收入占比", confidence: "中" },
    { name: "伊戈尔", code: "002922", segment: "电源 / 变压器 / 磁性器件", relation: "间接", reason: "电力电子 / 磁性器件相关,但缺明确数据中心供配电客户、订单或收入披露则不上调直接;看数据中心客户、变压器/电源订单验证", confidence: "低" },
    { name: "东方电气", code: "600875", segment: "发电装备", relation: "情绪映射", reason: "重型燃机 / 核电 / 发电装备,承接「算力耗电→发电需求」宏大叙事,传导链最长、映射最弱,本质是能源装备股", confidence: "低" },
    { name: "中国核电", code: "601985", segment: "核电运营", relation: "弱", reason: "在运在建核电资产,「算力耗电」宏大叙事的最远端,与数据中心建设无直接业务连接", confidence: "低" },
    { name: "中国广核", code: "003816", segment: "核电运营", relation: "弱", reason: "核电站开发运营,稳定现金流类资产,和数据中心订单缺明确连接", confidence: "低" },
  ],

  uncertainties: [
    "液冷渗透率、HVDC / 巴拿马电源渗透、储能配置比例,节奏都不确定,不宜线性外推。",
    "发电 / 核电(东方电气 / 中国核电 / 中国广核)刻意标情绪映射 / 弱:它们不直接给数据中心供设备,承接的是「算力耗电」宏大叙事,读成直接受益会严重失真。",
    "液冷配套(高澜 / 同飞 / 飞荣达)与麦格米特的数据中心收入占比,需以年报 / 公告披露为准,别把「有液冷 / 电源业务」等同于「数据中心订单」;曙光数创归直接但置信度中,同样以订单 / 收入占比验证。",
    "有没有被资金按「AI 电力」主题提前炒过头(price-in)没校验,需结合当日行情与资金面再看。",
  ],
  references: [
    { kind: "常设入口", name: "微软投资者关系(季度 capex)", url: "https://www.microsoft.com/en-us/investor", type: "云厂 capex", supports: "主线第1步(云厂数据中心资本开支)", note: "云厂资本开支与「数据中心 / AI 基础设施投入」口径(Alphabet / Meta / 亚马逊同理)" },
    { kind: "常设入口", name: "NVIDIA 数据中心 / GB 系列", url: "https://www.nvidia.com/en-us/data-center/", type: "服务器功率密度", supports: "主线第2步(单机柜功率密度提升)", note: "高功率 AI 服务器与机柜供电 / 散热要求,核实「单机柜数十 kW」的来源" },
    { kind: "常设入口", name: "Vertiv 投资者关系", url: "https://investors.vertiv.com", type: "数据中心供电 / 液冷", supports: "供配电 / 液冷环节(海外对标)", note: "数据中心供配电与热管理方案商口径,A 股供配电 / 液冷标的的海外对标" },
    { kind: "常设入口", name: "施耐德电气(Schneider)", url: "https://www.se.com/ww/en/about-us/investor-relations/", type: "数据中心供配电", supports: "供配电 / UPS / HVDC 环节(海外对标)", note: "数据中心供配电与能效方案口径" },
    { kind: "常设入口", name: "巨潮资讯网", url: "http://www.cninfo.com.cn", type: "A 股映射核验", supports: "各 A 股映射公司数据中心业务 / 订单核验", note: "盛弘 / 科士达 / 英维克 / 金盘 / 申菱等年报 / 公告里数据中心供配电 / 温控 / 液冷 / 变压器业务描述,以此为准" },
    { kind: "常设入口", name: "工业和信息化部(绿色数据中心 / 能耗)", url: "https://www.miit.gov.cn", type: "政策 / 能耗", supports: "数据中心能耗 / PUE 约束(需求侧背景)", note: "国家 / 部委关于数据中心能耗、绿色数据中心、电力负荷的政策文件" },
  ],
  disclaimer:
    "本内容为数据中心供配电与能效基础设施产业链的关联梳理,基于公开、公认的行业因果逻辑。当前页面包含常设官方核验入口;演示事件仍为样板事件,正式上线时会替换为当天真实事件,并为每一跳补充具体来源、发布时间、引用字段和更新时间。文中所有关系均为「关联 / 映射 / 受影响」,属非确认因果关系、仅统计非预测,不构成任何投资建议、不含买卖指令、目标价或涨跌预测。核心边界:该链核心是数据中心的供配电与散热基础设施,非泛电力行业;缺数据中心订单验证的电力题材标情绪映射 / 弱。本工具不提供证券投资咨询服务,所列个股仅为产业链关联的说明性示例,不构成任何推荐;个股波动风险自负。",
};

// ============================================================================
// AI 应用链 · ai-application insight v1.0(2026-07-03 合生产)。
// 上线范围:静态 insight + AI 链页入口(/chain/ai → 本页);首页事件自动联动【后续接入】
//   (P1.1「AI 应用事件触发源分类与 insight 路由」:Palantir/ServiceNow 强触发、
//    Adobe/Salesforce/MSFT/Oracle/Snowflake/Datadog 中触发需 AI 商业化关键词才路由)。
// AI 应用链(第三条手工 insight;2026-07-03 排期,沿用 ai-infra 模板)。
// 诚实核心(与硬件链的根本差异):海外 AI 应用和国内 AI 应用是「同题材、不同公司、无供货关系」,
// 不是产业链传导而是情绪映射。这条链 A 股【几乎没有直接映射】——把海外应用大涨读成国内应用
// 受益是最典型的误判。国内谁真受益,看它自己的付费用户、政企订单、AI 收入,不看海外股价。
// ============================================================================
const AI_APPLICATION: InsightChain = {
  slug: "ai-application",
  title: "海外 AI 应用大涨,为什么不等于国内 AI 应用受益?",
  updatedAt: "2026-07-03",
  event:
    "海外企业级 AI 应用商业化被重新定价——Palantir / ServiceNow 等公司 AI 相关收入或估值大幅提升,标志「AI 应用开始真正赚钱」——即一次「AI 应用商业化验证」型全球事件。",
  eventNote:
    "示例事件:这类「海外 AI 应用赚钱」的事持续发生(企业级 Agent、SaaS AI 加价);正式上线会换成当天真实公告(具体公司财报 / 产品定价)并核对数字。",
  tldr: {
    hook: "海外 AI 应用(Palantir 这些)大涨了——国内的科大讯飞、金山办公、同花顺就受益吗?一眼看懂 👇",
    tiers: [
      { emoji: "🟡", level: "自身可验证", what: "有真实国内 AI 收入的(金山办公 · 同花顺 · 科大讯飞)", rel: "间接", why: "有自己的 AI 付费用户 / 政企订单——不是海外传导,是自身商业化更可验证" },
      { emoji: "💨", level: "沾题材", what: "AIGC / 大模型概念(昆仑万维 · 三六零)", rel: "情绪映射", why: "题材热,但 AI 收入占比小、商业化早期,多是情绪带动" },
      { emoji: "⬜", level: "同题材不同公司", what: "所有 A 股 AI 应用股", rel: "情绪映射", why: "和海外应用无供货、无业务绑定——海外涨不等于国内受益" },
    ],
    risk: "海外 AI 应用赚钱,不等于国内 AI 应用赚钱。国内应用和海外应用是【同题材、不同公司、无供货关系】;国内谁真受益,要看它自己的付费用户、政企订单和 AI 收入,不是看海外股价。这条链 A 股几乎没有直接映射,别把情绪当传导。",
  },
  oneLinerPlain:
    "「海外 AI 应用赚钱了」这种事,国内的科大讯飞、金山办公、同花顺跟着涨,更多是【情绪跟风】——它们和海外的 Palantir、ServiceNow 没有供货或业务关系,是「同一个题材、不同的公司」。国内谁真受益,得看它自己的 AI 付费用户和订单,不是海外股价。这条链几乎没有「直接受益」的 A 股。",
  oneLiner:
    "「AI 应用商业化验证」型事件对 A 股应用股主要是【情绪映射】而非产业链传导:国内 AI 应用与海外应用无供货 / 收入绑定,属「同主题、异公司」。按「自身 AI 业务可验证性」(非推荐、非收益排序):有真实国内 AI 付费 / 订单的(金山办公 / 同花顺 / 科大讯飞)可给间接映射;AIGC / 大模型概念(昆仑万维 / 三六零)与端侧 AI 软件为情绪映射。核心边界:本链 A 股【无直接映射】,受益强度取决于国内公司自身收入兑现,与海外应用股价无因果。",
  eventPlain:
    "海外做 AI 应用的公司(像 Palantir、ServiceNow)业绩或股价大涨,市场认为「AI 应用终于开始赚钱了」。",
  storyPlain: [
    "海外企业级 AI 应用(Palantir、ServiceNow 这些)开始真正赚到钱。",
    "市场会把海外 AI 应用商业化的预期,映射到国内 AI 应用公司身上。",
    "但国内应用和海外应用没有供货、没有业务关系——是同一个题材、完全不同的公司。",
    "所以国内应用跟着涨,大多是情绪跟风,不是真的受益传导。",
    "国内谁真受益,要看它自己的 AI 付费用户、政企订单和收入,不是看海外股价。",
  ],
  storyPro:
    "专业上,这对应:海外企业级 AI(Agent / Copilot / 数据智能)ARR 提升验证付费意愿;但国内 AI 应用的商业化、付费习惯、政企预算、大模型成本仍在早期,映射为情绪而非供应链传导,受益需以国内公司自身 AI 收入兑现为准。",
  differentiators: [
    "诚实标注【无直接映射】:资讯的「AI 应用概念股」不会告诉你国内应用和海外应用没关系",
    "关系分级按「自身 AI 业务可验证性」:间接(有付费/订单)vs 情绪映射(有题材),不按热度",
    "把「同题材、不同公司、无供货」这个最容易被误读的点说透——这是应用链的核心风险",
  ],
  whyThisEvent:
    "本链差异化不在「列一堆 AI 应用股」,而在戳破一个高频误判:海外 AI 应用大涨,散户容易读成国内 AI 应用受益,但两者【无供货、无业务绑定】,是情绪而非传导。若换成「国内大模型降价 / 政企 AI 采购放量」事件,重心才转到国内应用的真实收入侧——那才是国内应用的直接驱动。红线:若「海外应用商业化」与「国内政企 AI 采购」两类事件产出同一张映射图,即为按类别检索预制图谱,产物不成立。",
  heatmapNote:
    "这里的「升温」表示商业化关注度提升,不代表股价判断,更非受益确认;强度 = 自身 AI 业务可验证性,非收益或涨幅。应用链 A 股多为情绪映射,直接映射基本没有。",
  heatmap: [
    { segment: "办公 / 生产力 AI", plain: "把 AI 装进办公软件(写文档、做表格)", direction: "升温", intensity: 3, relation: "间接", confidence: "中", reason: "国内办公 AI 有真实付费用户与订阅收入,是应用链里可验证性相对高的一档;但与海外应用无业务关系,受益看自身 AI 付费转化" },
    { segment: "金融信息 AI", plain: "把 AI 装进炒股/金融信息工具", direction: "升温", intensity: 3, relation: "间接", confidence: "中", reason: "金融信息 AI 有付费用户与增值服务,受趋势间接带动;和海外应用无供货,看自身 AI 增值收入" },
    { segment: "语音 / 多模态 AI", plain: "语音、翻译、多模态的 AI 应用", direction: "分化", intensity: 3, relation: "间接", confidence: "中", reason: "语音 / 多模态 + 政企订单有真实 AI 业务,但商业化与订单节奏不一,看政企 / 教育 / 医疗 AI 兑现" },
    { segment: "大模型 / AIGC 平台", plain: "自研大模型 + AIGC 生成应用", direction: "分化", intensity: 3, relation: "情绪映射", confidence: "低", reason: "大模型 / AIGC 题材热,但收入占比小、商业化早期,海外应用涨多为情绪带动" },
    { segment: "安全 / 垂直 AI", plain: "安全、搜索等垂直方向接大模型", direction: "分化", intensity: 2, relation: "情绪映射", confidence: "低", reason: "垂直方向接大模型,AI 收入占比小,情绪映射为主" },
    { segment: "端侧 AI 软件", plain: "手机/终端上的 AI 软件与操作系统", direction: "分化", intensity: 2, relation: "情绪映射", confidence: "中", reason: "端侧 AI 软件 / OS 与海外企业级应用不同赛道,受泛 AI 应用情绪带动,非同一驱动" },
    { segment: "🌍 海外对照组(触发源,非 A 股环节)", plain: "Palantir / ServiceNow——国内情绪映射的触发源,不是国内公司的收入来源", direction: "升温", intensity: 4, relation: "弱", confidence: "中", reason: "海外企业级 AI 应用商业化进展,是国内 AI 应用情绪映射的触发源,但与 A 股应用无供货 / 收入关系,不是 A 股映射标的——放此对照,别与国内环节平级理解" },
  ],
  hopsNote:
    "关键不是「传导了几跳」,而是【几乎没有传导】:国内应用和海外应用是同题材、不同公司,中间没有供货或业务关系。",
  mainHops: [
    {
      order: 1,
      from: "海外企业级 AI 应用赚钱(商业化验证)",
      to: "市场把「AI 应用能赚钱」外推到国内应用",
      plain: "海外像 Palantir、ServiceNow 这些 AI 应用公司开始真赚钱,市场就联想:国内做 AI 应用的是不是也要起来了?",
      logic: "海外企业级 AI 的 ARR / 付费验证,提升市场对「AI 应用可商业化」的整体预期,情绪外溢到同题材的国内标的。",
      evidenceType: "海外应用公司财报 / ARR 披露",
      evidenceExample: "Palantir / ServiceNow / Salesforce 财报里 AI 相关收入与 ARR 表述。引数字前须回原始来源。",
      confidence: "高",
    },
    {
      order: 2,
      from: "外推到国内应用",
      to: "但国内应用与海外应用【无供货、无业务关系】",
      plain: "可是国内应用和海外应用之间,既不供货、也没有业务绑定——不是一条产业链,只是同一个题材。",
      logic: "国内 AI 应用面向国内市场、用国内大模型、走国内政企 / C 端渠道,与海外应用在客户、供应、收入上均无因果连接;映射为情绪而非传导。",
      evidenceType: "业务结构 / 收入构成",
      evidenceExample: "国内公司年报的 AI 业务收入构成、客户结构;与海外应用无关联披露。",
      confidence: "高",
      caveat: "【核心红线】把海外应用股价当国内应用受益的因果,是本链最典型误判:两者无供货 / 收入绑定,情绪同涨不代表基本面同向。",
      caveatPlain: "最容易错的一步:看到海外 AI 应用大涨就买国内 AI 应用——它们没关系,涨的是情绪不是业绩。",
    },
  ],
  branchHops: [
    { order: 3, from: "国内应用真受益的前提", to: "自身 AI 付费 / 政企订单 / 收入兑现", plain: "国内应用要真受益,得看它自己的 AI 付费用户、政企订单和收入,不是海外股价。", logic: "国内应用的收入驱动来自国内 AI 付费转化、政企 / 行业 AI 采购、大模型成本下降后的毛利改善,与海外应用独立。", evidenceType: "国内公司 AI 收入 / 付费披露", evidenceExample: "金山办公 WPS AI 订阅、同花顺 AI 增值服务、科大讯飞政企 AI 订单等自身披露。", confidence: "中" },
  ],
  mappingNote:
    "按【自身 AI 业务可验证性】分级(非推荐、非收益排序);均为 stocks.ts 池内真实标的。核心边界:本链 A 股【无直接映射】——国内应用不给海外应用供货;有真实国内 AI 收入 / 订单的给间接,纯题材给情绪映射。海外应用(Palantir 等)是触发源、不是 A 股映射。",
  mappings: [
    { name: "金山办公", code: "688111", segment: "办公 / 生产力 AI", relation: "间接", relationNote: "自身商业化可验证", reason: "WPS AI 有真实付费用户与订阅收入,应用链里自身 AI 业务可验证性相对高;但与海外应用无业务关系,受益看自身 AI 付费转化", confidence: "中" },
    { name: "同花顺", code: "300033", segment: "金融信息 AI", relation: "间接", relationNote: "自身商业化可验证", reason: "金融信息 AI 有付费用户与增值服务,受 AI 应用趋势间接带动;和海外应用无供货,看自身 AI 增值收入兑现", confidence: "中" },
    { name: "科大讯飞", code: "002230", segment: "语音 / 多模态 AI", relation: "间接", relationNote: "自身商业化可验证", reason: "语音 / 多模态 AI + 政企订单有真实 AI 业务;受趋势间接带动,看政企 / 教育 / 医疗 AI 订单兑现,商业化节奏不一", confidence: "中" },
    { name: "昆仑万维", code: "300418", segment: "大模型 / AIGC 平台", relation: "情绪映射", reason: "天工大模型 / AIGC 题材热,但 AI 收入占比小、商业化早期,海外应用涨多为情绪带动", confidence: "低" },
    { name: "三六零", code: "601360", segment: "安全 / 垂直 AI", relation: "情绪映射", reason: "360 智脑 / AI 搜索题材,AI 收入占比小,情绪映射为主", confidence: "低" },
    { name: "中科创达", code: "300496", segment: "端侧 AI 软件", relation: "情绪映射", reason: "端侧 AI 软件 / OS 与海外企业级应用不同赛道,受泛 AI 应用情绪带动,非同一驱动", confidence: "中" },
  ],
  uncertainties: [
    "最容易看错:把「同题材」误认为「有传导」。本链 A 股【无直接映射】是刻意结论——国内应用不给海外应用供货,别把「AI 应用概念」读成「海外应用受益方」。",
    "间接映射(金山 / 同花顺 / 讯飞)的 AI 收入占比、付费转化、政企订单节奏,需以各自年报 / 公告披露为准,别把「有 AI 业务」等同于「AI 已贡献主要收入」。",
    "国内应用商业化、付费习惯、政企预算、大模型成本仍在早期,映射强度不宜线性外推。",
    "有没有被资金按「AI 应用」主题提前炒过头(price-in)没校验,需结合当日行情与资金面再看。",
  ],
  references: [
    { kind: "常设入口", name: "Palantir 投资者关系", url: "https://investors.palantir.com", type: "海外应用商业化", supports: "主线第1步(海外 AI 应用赚钱的触发源)", note: "企业级 AI 应用 ARR / 收入口径,本链触发源(事件侧),非 A 股映射" },
    { kind: "常设入口", name: "ServiceNow 投资者关系", url: "https://investors.servicenow.com", type: "企业 SaaS AI", supports: "主线第1步(AI 应用商业化验证)", note: "AI 工作流 / Agent 商业化口径" },
    { kind: "常设入口", name: "金山办公 · 巨潮资讯法定披露", url: "http://www.cninfo.com.cn/new/disclosure/stock?stockCode=688111", type: "国内 AI 应用收入", supports: "分支(国内应用自身 AI 付费验证)", note: "WPS AI 订阅 / AI 收入以定期报告为准" },
    { kind: "常设入口", name: "巨潮资讯网", url: "http://www.cninfo.com.cn", type: "A 股映射核验", supports: "各 A 股应用公司 AI 收入 / 付费核验", note: "科大讯飞 / 同花顺 / 昆仑万维等 AI 业务收入构成,以此为准" },
  ],
  disclaimer:
    "本内容为 AI 应用产业链的关联梳理,基于公开、公认的行业逻辑。当前页面包含常设官方核验入口;演示事件仍为样板事件,正式上线时会替换为当天真实事件,并为每一跳补充具体来源、发布时间、引用字段和更新时间。文中所有关系均为「关联 / 映射 / 受影响」,属非确认因果关系、仅统计非预测,不构成任何投资建议、不含买卖指令、目标价或涨跌预测。核心边界:本链 A 股应用与海外应用无供货 / 收入绑定,属情绪映射而非产业链传导,本链无直接映射;受益以国内公司自身 AI 收入兑现为准。本工具不提供证券投资咨询服务,所列个股仅为产业链关联的说明性示例,不构成任何推荐;个股波动风险自负。",
};


// ============================================================================
// 半导体设备与先进制程链(第四条 insight;2.2-B 三批,2026-07-07)。
// 关系数据源仍是 chain-relations §2.5(负责人两轮终审:7 direct + 1 indirect + 2 candidate)
// ——本 slug 刻意【不进】chain-relations 的 CHAIN_META:mappings 只作深读展示镜像,
// 不参与关系派生,避免与 §2.5 手工源双写冲突。
// 诚实边界:这是 AI 主链的【上游供给链】——AI 芯片要靠先进制程产能造出来,扩产带动的是
// 「造芯片的机器」;它与"半导体概念池"的区别=只收设备/EDA 等有环节归属与验证点的标的。
// ============================================================================
const SEMICONDUCTOR_EQUIPMENT: InsightChain = {
  slug: "semiconductor-equipment",
  title: "AI 芯片扩产,为什么会传导到半导体设备链?",
  updatedAt: "2026-07-07",
  event:
    "海外头部设备商(ASML / Lam 等)财报与订单指引走强,叠加先进制程产能紧缺、晶圆厂上修资本开支——即一次「先进制程扩产 / 设备订单周期上行」型结构性事件。",
  eventNote:
    "示例事件:这类「AI 芯片需求 → 晶圆厂扩产 → 设备订单」持续发生;正式上线会换成当天真实事件(设备商财报 / 晶圆厂 capex 指引 / 国内招标公告)并核对口径。",

  tldr: {
    hook: "AI 芯片不够用,晶圆厂就要扩产;扩产买的是「造芯片的机器」——这股需求会先传到哪几类设备?一眼看懂 👇",
    tiers: [
      { emoji: "🔥", level: "最直接", what: "刻蚀 · 薄膜沉积 · 涂胶显影 · 清洗 · CMP", rel: "直接", why: "晶圆厂扩产直接下设备订单,这些是产线的刚需工序设备" },
      { emoji: "🌡️", level: "跟着热", what: "量测检测 · EDA 工具", rel: "间接", why: "良率投资和设计活动跟着扩产走,但离设备订单隔一层" },
      { emoji: "💨", level: "沾光为主", what: "泛半导体国产替代题材", rel: "情绪映射", why: "没有环节归属和订单验证的「半导体概念」,多是主题带动" },
    ],
    risk: "设备订单是强周期:指引走强 ≠ 订单落地,扩产周期一旦转向、或出口管制变化打乱验证节奏,这条链的映射强度就要打折。记住:这条链的核心是「工序设备的订单验证」,不是半导体行业整体。",
  },

  oneLinerPlain:
    "这种「先进制程扩产 / 设备订单上行」的事,最先带动的是晶圆产线的刚需工序设备——刻蚀、薄膜沉积、涂胶显影、清洗、CMP;量测检测和 EDA 跟着良率投资与设计活动走,隔一层;没有环节归属的泛半导体题材,多是情绪带动。",
  oneLiner:
    "与本类「先进制程扩产」事件业务暴露最明确的是「晶圆制造工序设备链」。按「业务暴露 + 订单可验证性」(非推荐、非收益排序):刻蚀 / 薄膜沉积 / 涂胶显影 / 清洗 / CMP(设备主业直接承接扩产订单)> 量测检测 / EDA(良率投资与设计活动带动,隔一层)> 泛半导体题材(无环节归属,情绪映射)。核心边界:只收有环节归属与可验证订单路径的设备 / 工具标的,不做半导体概念池。",
  eventPlain:
    "AI 芯片供不应求,晶圆厂(台积电、中芯国际这些)要扩产;扩产就要买设备——光刻、刻蚀、沉积、清洗、抛光、检测,一台都少不了。",
  storyPlain: [
    "AI 芯片需求大,先进制程产能不够用,晶圆厂决定扩产。",
    "扩产 = 下设备订单:刻蚀、薄膜沉积、涂胶显影、清洗、CMP 这些工序设备最先接单。",
    "国内晶圆厂扩产叠加国产替代:同类国产设备进招标名单,验证通过后订单放量。",
    "产线要良率,量测检测设备跟着上;设计活动多了,EDA 工具授权跟着走。",
    "但设备是强周期生意:订单、验证、交付都有节奏,指引好不等于马上兑现。",
  ],
  storyPro:
    "专业上,这对应:晶圆厂 capex 上修与先进制程产能规划、设备商订单 / backlog 变化、国产设备的招标与产线验证周期、以及出口管制对设备供给与替代节奏的扰动。",

  differentiators: [
    "环节按晶圆制造工序拆(刻蚀/沉积/涂胶显影/清洗/CMP/量测/EDA),不是罗列半导体股",
    "个股关系分级经负责人逐票终审(7 直接 + 1 间接 + 2 待验证),每档带订单/收入验证点——资讯的「半导体设备概念」给不了这种切分",
    "明确划界:无环节归属与订单验证路径的题材不收;触发源(ASML/AMAT/LRCX 等)单列,不与 A 股映射混排",
  ],
  whyThisEvent:
    "这条链是 AI 主链的【上游供给链】:AI 主链看「算力怎么用起来」,本链看「算力芯片怎么造出来」——扩产事件的 delta 压在工序设备订单上。若换成「存储涨价」事件,重心转向存储原厂与模组,与设备链是两条链。红线:若「扩产」与「涨价」两类事件产出同一张热力图,即为按类别检索预制图谱,产物不成立。",

  heatmapNote:
    "「升温 / 降温 / 分化 / 中性」= 产业景气 / 业务暴露强弱,非股价涨跌预测;强度 = 业务暴露与证据完整度,非收益或涨幅排序。",
  heatmap: [
    { segment: "刻蚀设备", plain: "在晶圆上精确「雕刻」电路的设备", direction: "升温", intensity: 5, relation: "直接", confidence: "中", hopOrder: 3, reason: "扩产刚需工序设备,订单直接可验证;国产替代招标是第二重驱动" },
    { segment: "薄膜沉积", plain: "往晶圆上「镀膜」的设备(PECVD/ALD)", direction: "升温", intensity: 5, relation: "直接", confidence: "中", hopOrder: 3, reason: "与刻蚀同为扩产核心工序设备,先进制程验证进度是关键变量" },
    { segment: "光刻与涂胶显影", plain: "光刻前后给晶圆涂胶显影的设备", direction: "升温", intensity: 4, relation: "直接", confidence: "中", hopOrder: 3, reason: "配套光刻环节的刚需设备;光刻机本体依赖海外(ASML),国内映射在涂胶显影配套" },
    { segment: "清洗设备", plain: "制程间清洗晶圆的设备", direction: "升温", intensity: 4, relation: "直接", confidence: "中", hopOrder: 3, reason: "制程步骤越多清洗次数越多,先进制程放大需求" },
    { segment: "CMP / 抛光", plain: "把晶圆表面磨平的设备与耗材", direction: "升温", intensity: 4, relation: "直接", confidence: "中", hopOrder: 3, reason: "先进制程层数增加带动 CMP 步骤,设备+耗材双收入" },
    { segment: "量测检测", plain: "检查每步做没做对的量测与测试设备", direction: "升温", intensity: 3, relation: "间接", confidence: "中", hopOrder: 4, reason: "良率投资跟随扩产,但采购节奏与工序设备不同步、偏后道的测试隔一层" },
    { segment: "EDA / IP", plain: "设计芯片用的软件工具与授权模块", direction: "分化", intensity: 3, relation: "间接", confidence: "中", hopOrder: 5, reason: "设计活动与国产替代带动授权收入,但与扩产订单的联动弱一层;个股档位以自身收入披露为准" },
    { segment: "先进封装设备", plain: "芯片「叠装」环节用的专用设备", direction: "分化", intensity: 3, relation: "间接", confidence: "低", reason: "先进封装扩产带动,但当前股票池内无核定标的(收录中),先按环节观察" },
    { segment: "泛半导体国产替代题材", plain: "缺环节归属与订单验证的半导体概念", direction: "中性", intensity: 1, relation: "弱", confidence: "低", reason: "只沾「半导体 + 国产替代」概念、无设备订单验证(供参照的弱项)" },
  ],

  hopsNote:
    "刻蚀/沉积/涂胶显影/清洗/CMP 是被「晶圆厂扩产」一起带起来的并列工序,不是硬串的长链;量测/EDA 隔一层。",
  mainHops: [
    {
      order: 1,
      from: "AI 芯片需求增长",
      to: "晶圆厂上修资本开支(扩产)",
      plain: "AI 芯片供不应求,台积电、中芯国际这些晶圆厂就要扩产、上修资本开支。",
      logic: "先进制程产能紧缺推动晶圆厂 capex 上修与新产线规划。",
      evidenceType: "晶圆厂季报 capex 指引",
      evidenceExample: "台积电 / 中芯国际季报资本开支指引(以官方发布为准);引具体数字前须回原始来源核对。",
      confidence: "高",
      caveat: "【全链总闸】capex 指引是「预期」:若扩产计划推迟或收缩,整条设备链映射打折。",
      caveatPlain: "但扩产计划也可能推迟或缩水——那设备订单就到不了,这是最该盯的一步。",
    },
    {
      order: 2,
      from: "晶圆厂扩产",
      to: "设备订单 / backlog 上行",
      plain: "扩产就要买设备,设备商的订单和在手订单(backlog)最先反映出来。",
      logic: "扩产资本开支的大头是工序设备采购,设备商订单 / backlog 是最硬的前瞻指标。",
      evidenceType: "设备商财报订单 / backlog",
      evidenceExample: "ASML / Lam Research 季报订单与 backlog 表述(见下方常设入口)。",
      confidence: "高",
    },
  ],
  branchHops: [
    { order: 3, from: "扩产订单 + 国产替代招标", to: "国内工序设备商(刻蚀/沉积/涂胶显影/清洗/CMP)", plain: "国内晶圆厂扩产叠加国产替代,国产设备进招标名单、验证通过后进入批量供货。", logic: "扩产订单与国产替代双驱动;设备需经产线验证周期,节奏以招标与验收为准。", evidenceType: "A 股设备商披露", evidenceExample: "北方华创 / 中微 / 拓荆 / 芯源微 / 华海清科 / 盛美的设备订单、客户验证与收入确认表述。", confidence: "中" },
    { order: 4, from: "良率投资", to: "量测检测设备需求↑", plain: "产线要良率,每一步都要量测检测;测试设备跟着扩产走,但采购节奏晚一拍。", logic: "过程控制与测试设备跟随产能与良率爬坡,偏后道的测试传导多一跳。", evidenceType: "量测/测试设备商披露", evidenceExample: "长川科技测试设备订单与封测厂资本开支表述;海外对标 KLA(触发源)。", confidence: "中" },
    { order: 5, from: "设计活动 + 国产替代", to: "EDA 工具授权收入↑", plain: "芯片设计项目多了,设计软件(EDA)的授权和续约跟着走。", logic: "EDA 收入来自授权/续约,与扩产订单联动弱一层;国产替代是独立驱动。", evidenceType: "EDA 公司披露", evidenceExample: "概伦电子 / 华大九天工具授权收入与客户导入表述。", confidence: "中" },
  ],

  mappingNote:
    "分级经负责人逐票终审(2026-07-07 两轮,含 AI 审阅辅助;审计见 docs/relation-changelog.md):直接=设备主业直接承接扩产订单+订单/收入可验证;间接=传导隔一层(如偏后道的测试)。非推荐、非收益排序,均为 stocks.ts 池内真实标的。另有华大九天 / 精测电子 2 只待验证档(负责人保留,证据补齐后再定),未列入下表。",
  mappings: [
    { name: "北方华创", code: "002371", segment: "刻蚀 / 薄膜沉积平台", relation: "直接", reason: "国产半导体设备平台(刻蚀/薄膜沉积等多品类),设备主业直接进入扩产工序;看设备订单、国产替代招标与收入确认", confidence: "中" },
    { name: "中微公司", code: "688012", segment: "刻蚀设备", relation: "直接", reason: "刻蚀设备主业,直接服务先进制程与存储扩产;看刻蚀设备订单、客户验证与收入占比", confidence: "中" },
    { name: "拓荆科技", code: "688072", segment: "薄膜沉积", relation: "直接", reason: "薄膜沉积设备(PECVD/ALD 等)主业;看沉积设备订单、先进制程验证进度与客户结构", confidence: "中" },
    { name: "芯源微", code: "688037", segment: "光刻与涂胶显影", relation: "直接", reason: "涂胶显影设备主业,直接配套光刻环节;看涂胶显影机订单、产线导入进度与设备收入占比", confidence: "中" },
    { name: "华海清科", code: "688120", segment: "CMP / 抛光", relation: "直接", reason: "CMP 抛光设备主业;看 CMP 设备订单、产线验证与耗材配套收入", confidence: "中" },
    { name: "盛美上海", code: "688082", segment: "清洗设备", relation: "直接", reason: "半导体清洗设备主业,直接进入清洗环节;看清洗设备订单、海内外客户导入与收入占比", confidence: "中" },
    { name: "概伦电子", code: "688206", segment: "EDA / IP", relation: "直接", reason: "国产 EDA(器件建模/电路仿真)主业,工具直接服务设计与制程环节;看工具授权收入、客户续约与国产替代进度", confidence: "中" },
    { name: "长川科技", code: "300604", segment: "量测检测", relation: "间接", reason: "半导体测试设备(测试机/分选机)主业,偏后道封测环节、传导隔一层;看测试设备订单、封测厂资本开支与毛利率", confidence: "中" },
  ],

  uncertainties: [
    "设备订单强周期:指引走强 ≠ 订单落地,扩产节奏、验证周期、交付确认都有时滞,不宜线性外推。",
    "出口管制与供应链政策变化会同时改变海外设备商的可售范围与国产替代的节奏,方向不确定。",
    "量测检测与 EDA 刻意标间接/以个股披露为准:它们与扩产订单的联动隔一层,读成与工序设备同节奏会失真。",
    "华大九天 / 精测电子仍为待验证档(负责人保留),不在映射表内;先进封装设备环节池内暂无核定标的。",
    "有没有被资金按「半导体设备」主题提前炒过头(price-in)没校验,需结合当日行情与资金面再看。",
  ],
  references: [
    { kind: "常设入口", name: "ASML 投资者关系", url: "https://www.asml.com/en/investors", type: "设备订单 / backlog", supports: "主线第2步(设备订单上行)", note: "光刻设备订单与 backlog 口径,设备周期最权威的前瞻指标之一" },
    { kind: "常设入口", name: "Lam Research 投资者关系", url: "https://investor.lamresearch.com", type: "刻蚀/沉积设备景气", supports: "主线第2步 + 分支第3步(刻蚀/沉积环节)", note: "刻蚀与沉积设备商订单口径,国内同环节标的的海外对标" },
    { kind: "常设入口", name: "上交所公告检索", url: "http://www.sse.com.cn/disclosure/listedinfo/announcement/", type: "A 股映射核验(科创板)", supports: "中微/拓荆/芯源微/华海清科/盛美/概伦的订单与收入核验", note: "按代码检索年报、订单公告与业务披露,以此为准" },
    { kind: "常设入口", name: "巨潮资讯网", url: "http://www.cninfo.com.cn", type: "A 股映射核验(深市)", supports: "北方华创 / 长川科技的订单与收入核验", note: "定期报告 / 业绩快报 / 订单公告原文" },
  ],
  disclaimer:
    "本内容为半导体设备与先进制程产业链的关联梳理,基于公开、公认的行业因果逻辑。当前页面包含常设官方核验入口;演示事件仍为样板事件,正式上线时会替换为当天真实事件,并为每一跳补充具体来源、发布时间、引用字段和更新时间。文中所有关系均为「关联 / 映射 / 受影响」,属非确认因果关系、仅统计非预测,不构成任何投资建议、不含买卖指令、目标价或涨跌预测。核心边界:只收有环节归属与可验证订单路径的设备 / 工具标的,不做半导体概念池;设备为强周期行业,指引不等于订单。本工具不提供证券投资咨询服务,所列个股仅为产业链关联的说明性示例,不构成任何推荐;个股波动风险自负。",
};

export const INSIGHT_CHAINS: Record<string, InsightChain> = {
  [AI_INFRA.slug]: AI_INFRA,
  [DATACENTER_POWER.slug]: DATACENTER_POWER,
  [AI_APPLICATION.slug]: AI_APPLICATION,
  [SEMICONDUCTOR_EQUIPMENT.slug]: SEMICONDUCTOR_EQUIPMENT,
};
