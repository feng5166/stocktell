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
  // 去哪核实:常设官方入口(真实可点的 URL,不编造具体文章);正式上线时每跳另挂当天具体来源+时间戳
  references: { name: string; url: string; type: string; note: string }[];
  disclaimer: string;
}

const AI_INFRA: InsightChain = {
  slug: "ai-infra",
  title: "AI 推理基础设施 · 因果链",
  updatedAt: "2026-07-02",
  event:
    "英伟达季度财报上调数据中心收入指引,叠加新一代推理模型发布带动「单位算力 token 成本明显下降」——即一次「模型能力跃迁 / 推理成本↓」型全球事件。",
  eventNote:
    "示例事件:这类「AI 变便宜」的事历史上反复发生(历代模型发布/降价);正式上线会换成当天真实公告并核对数字。",

  tldr: {
    hook: "AI 要是算得更便宜了(比如 GPT-6 这种大事)——最先传到产业链的哪几段?一眼看懂 👇",
    tiers: [
      { emoji: "🔥", level: "最直接", what: "光模块 · 快内存(HBM)", rel: "直接", why: "数据中心里机器之间高速传数据的「光接头」;贴着 AI 芯片的「快内存」——AI 用得越多越抢手" },
      { emoji: "🌡️", level: "跟着热", what: "液冷 · 供电 · 先进封装", rel: "间接", why: "机器堆多了,要散热、要供电、要更强的封装工艺" },
      { emoji: "💨", level: "沾光为主", what: "国产 AI 芯片(海光 · 寒武纪)", rel: "情绪映射", why: "股价常跟着 AI 热度走,但它们不直接给英伟达供货——真受益要看自己的订单" },
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
    "真正一环扣一环的只有这两步:AI 变便宜 → 用得更多 → 云厂加大投入。其余环节是被「加大投入」一起带起来的(每个环节「怎么传到这的」见上方热力图行内展开),关系没主线这么直接。",
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
    { name: "中际旭创", code: "300308", segment: "光模块/高速互连", relation: "直接", reason: "全球光模块龙头,英伟达及北美四大云厂核心供应商,与集群扩展、速率迭代强绑定", confidence: "高" },
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
    { name: "OpenAI 官方定价页", url: "https://openai.com/api/pricing/", type: "官方定价", note: "核实「AI 算一次更便宜」:每百万 token 价格逐代变化" },
    { name: "英伟达投资者关系", url: "https://investor.nvidia.com", type: "财报/指引", note: "数据中心分部收入与下季指引原文" },
    { name: "微软投资者关系(云厂 capex 口径)", url: "https://www.microsoft.com/en-us/investor", type: "财报/资本开支", note: "云厂「AI 与数据中心投入」资本开支指引(Alphabet/Meta/亚马逊同理见各家 IR)" },
    { name: "美光投资者关系", url: "https://investors.micron.com", type: "财报", note: "HBM 产能与预定情况(SK 海力士同理)" },
    { name: "台积电投资者关系(法说会)", url: "https://investor.tsmc.com", type: "法说会", note: "CoWoS 先进封装扩产表述" },
    { name: "巨潮资讯网(A股法定信息披露)", url: "http://www.cninfo.com.cn", type: "A股公告", note: "文中 A 股标的的公告/订单披露原文,以此为准" },
  ],
  disclaimer:
    "本内容为 AI 推理基础设施产业链的关联梳理,基于公开、公认的行业因果逻辑与证据类型示例;「证据举例」仅说明真实上线时应引用何种来源,不含真实实时数字与 URL,种子事件为占位演示需替换为当日真事件。文中所有关系均为「关联/映射/受影响」,属非确认因果关系、仅统计非预测,不构成任何投资建议、不含买卖指令、目标价或涨跌预测。多跳链为「逻辑 + 证据」框架,非回测统计胜率。本工具不提供证券投资咨询服务,所列个股仅为产业链关联的说明性示例,不构成任何推荐;个股波动风险自负。",
};

export const INSIGHT_CHAINS: Record<string, InsightChain> = {
  [AI_INFRA.slug]: AI_INFRA,
};
