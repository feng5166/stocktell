// AI 产业链股票池种子数据
// 行情(price/change)用基于股票代码的确定性算法生成,模拟"行情已连接"状态,
// 后续接入真实行情(AKShare / Polygon.io)时替换 withQuote() 即可。
import { GEN_RETAIL_TAKES } from "./retail-takes.generated";

export type Market = "美股" | "A股";
export type Position = "上游" | "中游" | "下游";

// AI 产业链板块(细分,部分对齐 stocks.mastersgo.cc 的 category)
export const SECTORS = [
  "AI芯片/GPU",
  "CPU",
  "模拟芯片",
  "FPGA/特种芯片",
  "存储/HBM",
  "光模块/CPO",
  "铜连接/高速互连",
  "PCB/CCL",
  "服务器/算力",
  "交换机/网络",
  "半导体设备",
  "半导体材料",
  "封装测试/代工",
  "EDA/IP",
  "液冷/温控",
  "数据中心/IDC",
  "电源/HVDC",
  "能源/核电",
  "大模型/应用",
  "端侧AI/SoC",
  "消费电子/射频",
  "机器人/执行器",
  "战略材料/资源",
  "国防/卫星",
  "智能车",
  "加密/区块链",
] as const;
export type Sector = (typeof SECTORS)[number];

// 关系类型(对应顶部关系筛选)
export const RELATION_TYPES = [
  "产业链",
  "资本开支",
  "电力映射",
  "主题关联",
  "A股映射",
] as const;
export type RelationType = (typeof RELATION_TYPES)[number];

export type StatusTag = "今日有新消息" | "行情覆盖" | "长期观察";

export interface StockBase {
  code: string;
  name: string;
  market: Market;
  position: Position;
  sector: Sector;
  positioning: string; // 核心定位:一句话
  observation: string; // 关键观察
  status: StatusTag;
  relationTypes: RelationType[];
  relations: string[]; // 关联标的(名称)
}

export interface Stock extends StockBase {
  price: number;
  change: number; // 日涨跌 %
  live: boolean; // 是否为真实行情(否则为模拟)
  retailTake: string; // 散户怎么想:人话结论
}

// 散户怎么想:核心标的的人工结论(没命中则按板块模板生成)
const RETAIL_TAKES: Record<string, string> = {
  NVDA: "全球算力的总开关。它一动,A股光模块、服务器、PCB 第二天大概率跟着波动,是看 A股 AI 行情最重要的风向标。",
  "688041": "国产算力禁令下关联度最高的标的,情绪来时弹性大。但 PE 高、波动剧烈,追高需谨慎,适合等回调而非追板。",
  "688256": "纯国产 AI 芯片标的,题材一来涨得猛、跌得也狠。属于高 beta 情绪票,仓位要控制,别当压舱石拿。",
  "300308": "光模块全球龙头,跟英伟达/海外云厂资本开支高度绑定。海外财报超预期时它最先反应,但已连涨时追高要小心。",
  "300502": "光模块第二极,弹性比龙头更大。海外订单占比高,美股科技股大跌时它也容易被错杀,可逢回调关注。",
  "601138": "AI 服务器代工龙头,出货量是算力景气度的体温计。盘子大、相对稳,适合作为 AI 链里偏稳的配置。",
  "000977": "国产 AI 服务器龙头,与国产算力放量直接相关。跟着政策和大厂招标节奏走,消息驱动明显。",
  "002837": "液冷温控龙头,算力越堆越多、散热越刚需,逻辑顺。属于二线弹性,跟随主线情绪,不宜单独追高。",
  "688981": "国产代工龙头,更多是国产替代的长期叙事而非短期业绩弹性,适合长期观察、回调布局。",
  "002230": "国产大模型代表,题材属性强、业绩兑现慢。情绪票,跟着 AI 应用主题炒,落袋为安比死扛重要。",
  "300474": "A股唯一纯国产 GPU 标的,题材稀缺、弹性大。但业绩兑现慢、估值高,属高波动情绪票,追高务必控仓。",
  "603019": "国产算力整机龙头,海光的'大哥'。跟国产替代和招标节奏走,比纯题材票多一层业绩支撑,但盘子大、爆发力不如小盘妖票。",
  "600584": "全球封测一哥,AI 芯片要量产都绕不开它。产业链里偏稳的龙头,跟着景气走,不是暴涨暴跌的妖票。",
  "002130": "铜连接最火的妖票,直接绑英伟达 GB200 铜背板。题材一来涨得猛,但游资拥挤、波动极大,别在高位接最后一棒。",
  "300679": "高速铜缆/连接器,对标海外 CRDO,吃 GB200 放量。弹性大但跟主线情绪走,适合逢回调而非追板。",
  "688702": "A股唯一的国产交换芯片,对标博通。国产替代叙事强、业绩兑现还早,属主题票,仓位要控。",
  "300475": "A股最沾边 HBM 的影子股(海力士代理)。存储涨价+HBM 紧缺时弹性大,但本质是代理生意,别按纯芯片股给估值。",
  "300693": "数据中心 HVDC 电源新主线,对标 Vertiv 电力侧。算力越堆越多供电越刚需,逻辑顺,属二线弹性、跟随主线。",
  "002472": "人形机器人减速器/丝杠核心,绑特斯拉 Optimus 预期。机器人下半场主线票,题材弹性大,业绩看放量节奏。",
  "300418": "国产大模型+AIGC 应用,题材属性强、业绩兑现慢。典型情绪票,跟 AI 应用主题炒,落袋为安比死扛重要。",
  "002415": "AI 落地的大白马,机构重仓。盘子大、相对稳,是'AI 应用'里偏防御的配置,弹性不如小票但更扛跌。",
  // —— 修正生成版里被截断/写死股价的招牌文案(手写优先,不被重新生成覆盖)——
  "600206": "做芯片上游的靶材和稀贵金属材料,算二线弹性票。蹭 AI 热度时弹性不小,但本质是材料生意、要看客户验证和资源价格,别当核心仓死拿。",
  "000657": "钨资源和硬质合金龙头,沾 AI 是因为电路板钻头等下游要用钨。属于资源材料票,跟着钨价和下游需求走,弹性有限,别当 AI 主线追。",
  "300054": "给芯片厂抛光晶圆用的耗材商(抛光垫、抛光液),国产替代有空间。属于二线弹性票,关键看耗材放量和利润能不能兑现,别只盯短期波动。",
  "688300": "做芯片和高端电路板里用的粉体材料,在 AI 链上游算二线弹性。靠先进封装和高端板材的需求吃饭,关键看产能和高端产品放量。",
  "688535": "做先进封装材料(把多颗芯片封在一起那种),是 AI 上游的弹性选手。关键看大客户验证和毛利率能不能起来,题材热但业绩兑现要时间。",
  WDC: "美国存储大厂,主卖数据中心用的大容量硬盘。AI 数据越堆越多、存储需求水涨船高时它也吃得到,但本质是有周期的硬件生意,跟着存储涨价和数据中心订单走。",
  LNG: "美国最大的液化天然气出口商,沾 AI 是因为数据中心耗电猛、天然气发电需求被带起来。但它本质是能源股,价格看长期供货合同和欧亚需求,跟 AI 只是间接关系,别当纯 AI 票炒。",
  LMT: "美国军工巨头,跟 AI 产业链关系不大,更多是国防开支和海外订单的逻辑。放在这里是产业链的边缘参考,别按 AI 概念给它估值。",
  RKLB: "美国商业航天公司,造火箭和卫星。属于太空题材的高波动票,业绩要看新火箭首飞和订单,跟 AI 是远房亲戚,情绪来时弹性大、风险也大。",
  PL: "美国遥感卫星数据商,算 AI 产业链里的数据层。目前更偏题材股,收入靠政府合同续签和商业拓展,业绩还没兑现,适合观察、别重仓赌。",
};

// 板块大白话释义:给看不懂产业链的散户,每个 canonical 板块一句人话。
export const SECTOR_GLOSS: Record<string, string> = {
  "AI芯片/GPU": "给 AI 算力当“大脑”的核心芯片",
  CPU: "电脑/服务器的中央处理器",
  模拟芯片: "管电压电流等“模拟信号”的芯片,量大、单价低",
  "FPGA/特种芯片": "可编程/特种用途芯片,军工和特定场景用得多",
  "存储/HBM": "存数据的芯片,AI 最缺的高带宽内存(HBM)也在这",
  "光模块/CPO": "AI 服务器之间传数据的“光接头”,AI 越火越缺货",
  "铜连接/高速互连": "服务器内部高速传数据的“铜线/接头”,GB200 主力",
  "PCB/CCL": "电路板及其原材料,AI 服务器用的特别贵",
  "服务器/算力": "把芯片组装成 AI 服务器/算力整机的",
  "交换机/网络": "数据中心里给服务器联网的设备和芯片",
  半导体设备: "造芯片用的机器(光刻/刻蚀/清洗等)",
  半导体材料: "造芯片用的原料(特气/靶材/化学品等),最上游",
  "封装测试/代工": "把芯片切割、封装、测试、代工的环节",
  "EDA/IP": "设计芯片的软件和现成模块,没它造不出芯片",
  "液冷/温控": "给发热的 AI 服务器散热降温的",
  "数据中心/IDC": "放服务器的“机房”及其建设运营",
  "电源/HVDC": "给数据中心供电的电力电子设备",
  "能源/核电": "给算力提供电力的发电(含核电)",
  "大模型/应用": "做 AI 大模型和上层软件应用的",
  "端侧AI/SoC": "手机/设备里跑 AI 的芯片和硬件",
  "消费电子/射频": "手机等消费电子里的芯片(图像/射频等)",
  "机器人/执行器": "机器人和它的“关节零件”(减速器/丝杠/电机)",
  "战略材料/资源": "稀土/钨/锗等战略小金属与资源",
  "国防/卫星": "军工与航天卫星",
  智能车: "电动车/智能汽车",
  "加密/区块链": "加密货币与区块链相关",
};

// 梯队标签(半人工圈定,只标有把握的板块龙头/二线弹性,不硬给"跟风"避免误判)。
export const TIER: Record<string, "龙头" | "二线"> = {
  "300033": "龙头", "300124": "龙头", "300308": "龙头", "300394": "二线",
  "300442": "龙头", "300474": "二线", "300475": "二线", "300476": "龙头",
  "300502": "二线", "300620": "二线", "300661": "龙头", "300679": "二线",
  "300693": "二线", "300782": "二线", "301269": "龙头", "600111": "龙头",
  "600584": "龙头", "601138": "龙头", "601689": "二线", "603019": "龙头",
  "603083": "二线", "603501": "龙头", "603728": "二线", "603893": "二线",
  "603986": "龙头", "688008": "龙头", "688012": "龙头", "688017": "龙头",
  "688041": "龙头", "688111": "龙头", "688256": "龙头", "688313": "二线",
  "688362": "二线", "688702": "二线", "688981": "龙头", "000977": "龙头",
  "002130": "龙头", "002371": "龙头", "002463": "龙头", "002916": "龙头",
  "002230": "龙头", "002837": "龙头", "002049": "龙头", "002179": "龙头",
  "000063": "龙头", "002050": "龙头", "002851": "龙头", "002185": "二线",
  "002156": "二线", "002472": "二线",
};

function makeRetailTake(s: StockBase): string {
  if (RETAIL_TAKES[s.code]) return RETAIL_TAKES[s.code]; // 手写优先
  if (GEN_RETAIL_TAKES[s.code]) return GEN_RETAIL_TAKES[s.code]; // 再用 LLM 逐只生成
  const gloss = SECTOR_GLOSS[s.sector];
  const role =
    s.position === "上游"
      ? "在产业链里偏上游,离最终需求远一点,业绩兑现通常更靠后"
      : s.position === "中游"
      ? "处在产业链中游,跟 AI 主线情绪同步性强"
      : "偏下游应用,更多看题材和需求驱动";
  const head = gloss ? `属于「${s.sector}」——${gloss}。` : `属于「${s.sector}」。`;
  return `${head}${role};短期跟着板块情绪走,不构成投资建议。`;
}

const STOCKS_BASE: StockBase[] = [
  // ===== 美股 =====
  { code: "NVDA", name: "英伟达", market: "美股", position: "上游", sector: "AI芯片/GPU", positioning: "AI 算力霸主,GPU 绝对龙头", observation: "数据中心收入持续高增,定义全球算力节奏", status: "今日有新消息", relationTypes: ["产业链", "资本开支", "A股映射"], relations: ["中际旭创", "工业富联", "海光信息"] },
  { code: "AMD", name: "超威半导体", market: "美股", position: "上游", sector: "AI芯片/GPU", positioning: "GPU 第二极,MI 系列对标英伟达", observation: "MI300/MI350 放量节奏决定第二供应商逻辑", status: "行情覆盖", relationTypes: ["产业链"], relations: ["海光信息", "寒武纪"] },
  { code: "AVGO", name: "博通", market: "美股", position: "上游", sector: "交换机/网络", positioning: "定制 ASIC + 网络芯片双轮", observation: "云厂自研芯片代工核心标的", status: "行情覆盖", relationTypes: ["产业链", "资本开支"], relations: ["中兴通讯"] },
  { code: "TSM", name: "台积电", market: "美股", position: "上游", sector: "封装测试/代工", positioning: "先进制程独家代工", observation: "CoWoS 封装产能是算力供给瓶颈", status: "行情覆盖", relationTypes: ["产业链"], relations: ["中芯国际"] },
  { code: "ASML", name: "阿斯麦", market: "美股", position: "上游", sector: "半导体设备", positioning: "EUV 光刻机独家供应", observation: "设备订单是产业链景气度前瞻指标", status: "行情覆盖", relationTypes: ["产业链"], relations: ["北方华创"] },
  { code: "MU", name: "美光", market: "美股", position: "上游", sector: "存储/HBM", positioning: "HBM 高带宽存储三巨头之一", observation: "HBM 供不应求,绑定 GPU 出货", status: "行情覆盖", relationTypes: ["产业链"], relations: ["兆易创新", "澜起科技"] },
  { code: "MRVL", name: "迈威尔", market: "美股", position: "上游", sector: "光模块/CPO", positioning: "光 DSP + 定制芯片", observation: "光互连与定制 ASIC 双逻辑", status: "行情覆盖", relationTypes: ["产业链"], relations: ["新易盛", "天孚通信"] },
  { code: "ARM", name: "Arm", market: "美股", position: "上游", sector: "EDA/IP", positioning: "全球 CPU 架构 IP 授权", observation: "端侧与服务器架构渗透", status: "行情覆盖", relationTypes: ["产业链"], relations: ["瑞芯微"] },
  { code: "INTC", name: "英特尔", market: "美股", position: "上游", sector: "CPU", positioning: "x86 CPU 老牌龙头", observation: "代工转型与 AI PC 双线承压", status: "长期观察", relationTypes: ["产业链"], relations: ["海光信息"] },
  { code: "SMCI", name: "超微电脑", market: "美股", position: "中游", sector: "服务器/算力", positioning: "AI 服务器整机弹性标的", observation: "液冷服务器放量,业绩与算力强相关", status: "行情覆盖", relationTypes: ["产业链", "资本开支"], relations: ["工业富联", "浪潮信息"] },
  { code: "DELL", name: "戴尔", market: "美股", position: "中游", sector: "服务器/算力", positioning: "企业级 AI 服务器主力", observation: "AI 服务器订单 backlog 创新高", status: "行情覆盖", relationTypes: ["资本开支"], relations: ["浪潮信息"] },
  { code: "ANET", name: "Arista", market: "美股", position: "中游", sector: "交换机/网络", positioning: "数据中心高速交换机龙头", observation: "800G 交换升级,绑定云厂扩容", status: "行情覆盖", relationTypes: ["产业链", "资本开支"], relations: ["中兴通讯", "紫光股份"] },
  { code: "VRT", name: "Vertiv", market: "美股", position: "中游", sector: "液冷/温控", positioning: "数据中心液冷与供配电", observation: "液冷渗透率提升直接相关", status: "今日有新消息", relationTypes: ["资本开支", "电力映射"], relations: ["英维克", "科华数据"] },
  { code: "MSFT", name: "微软", market: "美股", position: "下游", sector: "数据中心/IDC", positioning: "Azure + OpenAI 算力买方", observation: "资本开支指引是算力链晴雨表", status: "行情覆盖", relationTypes: ["资本开支"], relations: ["中际旭创"] },
  { code: "GOOGL", name: "谷歌", market: "美股", position: "下游", sector: "数据中心/IDC", positioning: "自研 TPU + 云需求", observation: "TPU 路线影响定制芯片格局", status: "行情覆盖", relationTypes: ["资本开支", "产业链"], relations: ["工业富联"] },
  { code: "AMZN", name: "亚马逊", market: "美股", position: "下游", sector: "数据中心/IDC", positioning: "AWS 全球最大云厂", observation: "自研 Trainium 与外采并行", status: "行情覆盖", relationTypes: ["资本开支"], relations: [] },
  { code: "META", name: "Meta", market: "美股", position: "下游", sector: "大模型/应用", positioning: "开源大模型 + 巨额算力投入", observation: "Capex 大幅上修,GPU 采购大户", status: "今日有新消息", relationTypes: ["资本开支"], relations: ["中际旭创", "新易盛"] },
  { code: "ORCL", name: "甲骨文", market: "美股", position: "下游", sector: "数据中心/IDC", positioning: "OCI 云 + RPO 暴增", observation: "RPO 订单验证算力需求真实性", status: "今日有新消息", relationTypes: ["资本开支"], relations: [] },
  { code: "PLTR", name: "Palantir", market: "美股", position: "下游", sector: "大模型/应用", positioning: "AI 落地应用平台", observation: "商业化变现节奏受关注", status: "行情覆盖", relationTypes: ["主题关联"], relations: ["科大讯飞"] },
  { code: "TSLA", name: "特斯拉", market: "美股", position: "下游", sector: "机器人/执行器", positioning: "FSD + 人形机器人 Optimus", observation: "具身智能主题映射 A 股", status: "行情覆盖", relationTypes: ["主题关联"], relations: ["埃斯顿", "汇川技术"] },
  { code: "CRWV", name: "CoreWeave", market: "美股", position: "中游", sector: "数据中心/IDC", positioning: "纯 GPU 云租赁新贵", observation: "算力租赁模式扩张激进", status: "行情覆盖", relationTypes: ["资本开支"], relations: [] },
  { code: "COHR", name: "相干", market: "美股", position: "上游", sector: "光模块/CPO", positioning: "光器件与光芯片", observation: "光通信上游,绑定光模块景气", status: "行情覆盖", relationTypes: ["产业链"], relations: ["光迅科技"] },
  { code: "LRCX", name: "泛林半导体", market: "美股", position: "上游", sector: "半导体设备", positioning: "刻蚀设备龙头", observation: "存储扩产带动设备需求", status: "行情覆盖", relationTypes: ["产业链"], relations: ["中微公司"] },
  { code: "AMAT", name: "应用材料", market: "美股", position: "上游", sector: "半导体设备", positioning: "全球最大半导体设备商", observation: "先进制程设备风向标", status: "行情覆盖", relationTypes: ["产业链"], relations: ["北方华创"] },
  { code: "CDNS", name: "Cadence", market: "美股", position: "上游", sector: "EDA/IP", positioning: "EDA 工具双寡头之一", observation: "AI 芯片设计离不开 EDA", status: "行情覆盖", relationTypes: ["产业链"], relations: ["华大九天"] },
  { code: "SNPS", name: "新思科技", market: "美股", position: "上游", sector: "EDA/IP", positioning: "EDA 工具双寡头之一", observation: "AI 辅助设计渗透", status: "行情覆盖", relationTypes: ["产业链"], relations: ["华大九天"] },
  { code: "DLR", name: "Digital Realty", market: "美股", position: "中游", sector: "数据中心/IDC", positioning: "全球数据中心 REIT", observation: "IDC 上架率与电力供给", status: "长期观察", relationTypes: ["电力映射"], relations: [] },

  // ===== A股 =====
  { code: "688041", name: "海光信息", market: "A股", position: "上游", sector: "AI芯片/GPU", positioning: "国产 CPU/DCU,英伟达在华替代", observation: "国产算力禁令下关联度最高,估值偏高", status: "今日有新消息", relationTypes: ["A股映射", "主题关联"], relations: ["NVDA", "AMD", "INTC"] },
  { code: "688256", name: "寒武纪", market: "A股", position: "上游", sector: "AI芯片/GPU", positioning: "国产 AI 芯片纯标的", observation: "订单放量验证国产替代,波动极大", status: "今日有新消息", relationTypes: ["A股映射", "主题关联"], relations: ["NVDA", "AMD"] },
  { code: "000977", name: "浪潮信息", market: "A股", position: "中游", sector: "服务器/算力", positioning: "国产 AI 服务器龙头", observation: "对标超微/戴尔,算力扩容核心", status: "行情覆盖", relationTypes: ["A股映射", "资本开支"], relations: ["SMCI", "DELL"] },
  { code: "601138", name: "工业富联", market: "A股", position: "中游", sector: "服务器/算力", positioning: "全球 AI 服务器代工龙头", observation: "绑定英伟达/云厂,出货量风向标", status: "今日有新消息", relationTypes: ["A股映射", "产业链"], relations: ["NVDA", "GOOGL"] },
  { code: "300308", name: "中际旭创", market: "A股", position: "上游", sector: "光模块/CPO", positioning: "全球光模块龙头", observation: "800G/1.6T 升级核心,跟随英伟达节奏", status: "今日有新消息", relationTypes: ["A股映射", "产业链"], relations: ["NVDA", "MSFT", "META"] },
  { code: "300502", name: "新易盛", market: "A股", position: "上游", sector: "光模块/CPO", positioning: "光模块第二极,高速率弹性", observation: "海外云厂订单占比高", status: "今日有新消息", relationTypes: ["A股映射", "产业链"], relations: ["MRVL", "META"] },
  { code: "300394", name: "天孚通信", market: "A股", position: "上游", sector: "光模块/CPO", positioning: "光器件平台型公司", observation: "光模块上游配套,毛利率高", status: "行情覆盖", relationTypes: ["产业链"], relations: ["MRVL"] },
  { code: "002281", name: "光迅科技", market: "A股", position: "上游", sector: "光模块/CPO", positioning: "光芯片+光模块国家队", observation: "国产光芯片自主可控", status: "行情覆盖", relationTypes: ["产业链"], relations: ["COHR"] },
  { code: "300570", name: "太辰光", market: "A股", position: "上游", sector: "光模块/CPO", positioning: "无源光器件", observation: "MPO 跳线关联高速互连", status: "长期观察", relationTypes: ["产业链"], relations: [] },
  { code: "002463", name: "沪电股份", market: "A股", position: "上游", sector: "PCB/CCL", positioning: "AI 服务器高多层 PCB", observation: "算力 PCB 价值量提升", status: "行情覆盖", relationTypes: ["产业链"], relations: ["NVDA"] },
  { code: "002916", name: "深南电路", market: "A股", position: "上游", sector: "PCB/CCL", positioning: "PCB + 封装基板", observation: "高端载板国产替代", status: "行情覆盖", relationTypes: ["产业链"], relations: [] },
  { code: "300476", name: "胜宏科技", market: "A股", position: "上游", sector: "PCB/CCL", positioning: "高阶 HDI/PCB", observation: "AI 板卡订单弹性", status: "今日有新消息", relationTypes: ["产业链"], relations: ["NVDA"] },
  { code: "600183", name: "生益科技", market: "A股", position: "上游", sector: "PCB/CCL", positioning: "覆铜板龙头", observation: "受高频高速材料需求带动", status: "行情覆盖", relationTypes: ["产业链"], relations: [] },
  { code: "688981", name: "中芯国际", market: "A股", position: "上游", sector: "封装测试/代工", positioning: "国产晶圆代工龙头", observation: "先进制程国产化核心", status: "行情覆盖", relationTypes: ["A股映射", "产业链"], relations: ["TSM"] },
  { code: "002371", name: "北方华创", market: "A股", position: "上游", sector: "半导体设备", positioning: "国产半导体设备龙头", observation: "刻蚀/薄膜平台,受扩产带动", status: "行情覆盖", relationTypes: ["A股映射", "产业链"], relations: ["AMAT", "ASML"] },
  { code: "688012", name: "中微公司", market: "A股", position: "上游", sector: "半导体设备", positioning: "刻蚀设备国产龙头", observation: "先进制程刻蚀突破", status: "行情覆盖", relationTypes: ["产业链"], relations: ["LRCX"] },
  { code: "603986", name: "兆易创新", market: "A股", position: "上游", sector: "存储/HBM", positioning: "存储+MCU 国产龙头", observation: "存储涨价周期弹性", status: "行情覆盖", relationTypes: ["产业链"], relations: ["MU"] },
  { code: "688008", name: "澜起科技", market: "A股", position: "上游", sector: "存储/HBM", positioning: "内存接口芯片全球龙头", observation: "受 DDR5/HBM 配套带动", status: "今日有新消息", relationTypes: ["产业链"], relations: ["MU"] },
  { code: "300661", name: "圣邦股份", market: "A股", position: "上游", sector: "模拟芯片", positioning: "模拟芯片平台型龙头", observation: "电源/信号链配套算力", status: "长期观察", relationTypes: ["产业链"], relations: [] },
  { code: "603501", name: "韦尔股份", market: "A股", position: "上游", sector: "消费电子/射频", positioning: "CIS 图像传感器龙头", observation: "端侧 AI 与手机复苏", status: "行情覆盖", relationTypes: ["主题关联"], relations: [] },
  { code: "688521", name: "芯原股份", market: "A股", position: "上游", sector: "EDA/IP", positioning: "国产芯片设计 IP 平台", observation: "Chiplet/IP 授权模式", status: "长期观察", relationTypes: ["产业链"], relations: ["ARM"] },
  { code: "301269", name: "华大九天", market: "A股", position: "上游", sector: "EDA/IP", positioning: "国产 EDA 龙头", observation: "EDA 自主可控稀缺标的", status: "行情覆盖", relationTypes: ["A股映射", "产业链"], relations: ["CDNS", "SNPS"] },
  { code: "603893", name: "瑞芯微", market: "A股", position: "上游", sector: "端侧AI/SoC", positioning: "端侧 AI SoC 龙头", observation: "受 AIoT 与边缘算力带动", status: "今日有新消息", relationTypes: ["主题关联"], relations: ["ARM"] },
  { code: "300496", name: "中科创达", market: "A股", position: "下游", sector: "端侧AI/SoC", positioning: "端侧 AI 软件+操作系统", observation: "大模型端侧落地", status: "行情覆盖", relationTypes: ["主题关联"], relations: [] },
  { code: "000063", name: "中兴通讯", market: "A股", position: "中游", sector: "交换机/网络", positioning: "通信设备+算力服务器", observation: "受运营商算力投资带动", status: "行情覆盖", relationTypes: ["A股映射", "产业链"], relations: ["AVGO", "ANET"] },
  { code: "000938", name: "紫光股份", market: "A股", position: "中游", sector: "交换机/网络", positioning: "新华三,交换机+服务器", observation: "国产网络设备龙头", status: "行情覆盖", relationTypes: ["产业链"], relations: ["ANET"] },
  { code: "002475", name: "立讯精密", market: "A股", position: "中游", sector: "服务器/算力", positioning: "连接器+算力组件", observation: "受高速铜连接带动", status: "行情覆盖", relationTypes: ["产业链"], relations: [] },
  { code: "002837", name: "英维克", market: "A股", position: "中游", sector: "液冷/温控", positioning: "数据中心液冷龙头", observation: "液冷渗透率提升核心标的", status: "今日有新消息", relationTypes: ["A股映射", "电力映射"], relations: ["VRT"] },
  { code: "002335", name: "科华数据", market: "A股", position: "中游", sector: "液冷/温控", positioning: "数据中心+储能温控", observation: "IDC 与电力配套双逻辑", status: "行情覆盖", relationTypes: ["电力映射"], relations: ["VRT"] },
  { code: "300499", name: "高澜股份", market: "A股", position: "中游", sector: "液冷/温控", positioning: "纯水冷却+液冷", observation: "算力散热弹性标的", status: "长期观察", relationTypes: ["电力映射"], relations: [] },
  { code: "002851", name: "麦格米特", market: "A股", position: "中游", sector: "电源/HVDC", positioning: "电源+电控平台", observation: "服务器电源关联算力需求", status: "行情覆盖", relationTypes: ["电力映射"], relations: [] },
  { code: "300870", name: "欧陆通", market: "A股", position: "中游", sector: "电源/HVDC", positioning: "服务器电源", observation: "高功率电源升级", status: "长期观察", relationTypes: ["电力映射"], relations: [] },
  { code: "601728", name: "中国电信", market: "A股", position: "下游", sector: "数据中心/IDC", positioning: "运营商云+算力网络", observation: "国家算力投资主力", status: "行情覆盖", relationTypes: ["资本开支", "电力映射"], relations: [] },
  { code: "600050", name: "中国联通", market: "A股", position: "下游", sector: "数据中心/IDC", positioning: "运营商云+IDC", observation: "受算力网络建设带动", status: "长期观察", relationTypes: ["资本开支"], relations: [] },
  { code: "002230", name: "科大讯飞", market: "A股", position: "下游", sector: "大模型/应用", positioning: "国产大模型+语音 AI", observation: "星火大模型商业化", status: "今日有新消息", relationTypes: ["主题关联"], relations: ["PLTR"] },
  { code: "300033", name: "同花顺", market: "A股", position: "下游", sector: "大模型/应用", positioning: "金融 AI 应用", observation: "AI 投顾落地场景", status: "行情覆盖", relationTypes: ["主题关联"], relations: [] },
  { code: "688111", name: "金山办公", market: "A股", position: "下游", sector: "大模型/应用", positioning: "办公软件 AI 化", observation: "WPS AI 订阅变现", status: "行情覆盖", relationTypes: ["主题关联"], relations: ["MSFT"] },
  { code: "002747", name: "埃斯顿", market: "A股", position: "下游", sector: "机器人/执行器", positioning: "国产工业机器人龙头", observation: "人形机器人主题映射", status: "行情覆盖", relationTypes: ["主题关联"], relations: ["TSLA"] },
  { code: "300124", name: "汇川技术", market: "A股", position: "下游", sector: "机器人/执行器", positioning: "工控+机器人平台", observation: "具身智能核心零部件", status: "行情覆盖", relationTypes: ["主题关联"], relations: ["TSLA"] },
  { code: "002049", name: "紫光国微", market: "A股", position: "上游", sector: "FPGA/特种芯片", positioning: "特种芯片+FPGA", observation: "受国产可编程逻辑带动", status: "长期观察", relationTypes: ["产业链"], relations: [] },
  { code: "300782", name: "卓胜微", market: "A股", position: "上游", sector: "消费电子/射频", positioning: "射频前端龙头", observation: "端侧通信配套", status: "长期观察", relationTypes: ["主题关联"], relations: [] },
  { code: "002261", name: "拓维信息", market: "A股", position: "中游", sector: "服务器/算力", positioning: "华为昇腾生态算力", observation: "国产算力生态弹性", status: "今日有新消息", relationTypes: ["A股映射", "主题关联"], relations: ["NVDA"] },
  { code: "LITE", name: "Lumentum Holdings", market: "美股", position: "上游", sector: "光模块/CPO", positioning: "光器件与数据中心互联", observation: "数据中心互联订单", status: "行情覆盖", relationTypes: ["产业链"], relations: [] },
  { code: "FN", name: "Fabrinet", market: "美股", position: "上游", sector: "光模块/CPO", positioning: "光通信代工", observation: "大客户依赖度", status: "行情覆盖", relationTypes: ["产业链"], relations: [] },
  { code: "CIEN", name: "Ciena", market: "美股", position: "上游", sector: "光模块/CPO", positioning: "光网络系统", observation: "运营商资本开支周期", status: "行情覆盖", relationTypes: ["产业链"], relations: [] },
  { code: "IPGP", name: "IPG Photonics", market: "美股", position: "上游", sector: "光模块/CPO", positioning: "工业激光器", observation: "工业需求恢复与产品迭代", status: "行情覆盖", relationTypes: ["产业链"], relations: [] },
  { code: "GLW", name: "Corning", market: "美股", position: "上游", sector: "光模块/CPO", positioning: "光纤与特种材料", observation: "数据中心光纤需求与显示业务恢复", status: "行情覆盖", relationTypes: ["产业链"], relations: [] },
  { code: "WDC", name: "Western Digital", market: "美股", position: "上游", sector: "存储/HBM", positioning: "大容量HDD", observation: "数据中心订单与大容量盘价格", status: "行情覆盖", relationTypes: ["产业链"], relations: [] },
  { code: "SNDK", name: "Sandisk", market: "美股", position: "上游", sector: "存储/HBM", positioning: "NAND与企业级SSD", observation: "企业级SSD占比与NAND周期", status: "行情覆盖", relationTypes: ["产业链"], relations: [] },
  { code: "STX", name: "Seagate Technology", market: "美股", position: "上游", sector: "存储/HBM", positioning: "大容量HDD", observation: "HAMR出货节奏", status: "行情覆盖", relationTypes: ["产业链"], relations: [] },
  { code: "CLS", name: "Celestica", market: "美股", position: "中游", sector: "数据中心/IDC", positioning: "ODM制造", observation: "超大客户集中度", status: "行情覆盖", relationTypes: ["产业链"], relations: [] },
  { code: "NBIS", name: "Nebius Group", market: "美股", position: "中游", sector: "数据中心/IDC", positioning: "AI基础设施服务", observation: "客户结构与现金消耗", status: "行情覆盖", relationTypes: ["产业链"], relations: [] },
  { code: "CVX", name: "Chevron", market: "美股", position: "中游", sector: "能源/核电", positioning: "综合油气与基础负荷", observation: "回购派息与天然气敞口", status: "行情覆盖", relationTypes: ["产业链"], relations: [] },
  { code: "LNG", name: "Cheniere Energy", market: "美股", position: "中游", sector: "能源/核电", positioning: "液化天然气出口", observation: "长协价格与欧亚需求", status: "行情覆盖", relationTypes: ["产业链"], relations: [] },
  { code: "GEV", name: "GE Vernova", market: "美股", position: "中游", sector: "能源/核电", positioning: "电网与燃气轮机", observation: "燃气轮机及电网订单backlog", status: "行情覆盖", relationTypes: ["产业链"], relations: [] },
  { code: "BE", name: "Bloom Energy", market: "美股", position: "中游", sector: "能源/核电", positioning: "燃料电池与分布式供电", observation: "数据中心PPA落地", status: "行情覆盖", relationTypes: ["产业链"], relations: [] },
  { code: "FLNC", name: "Fluence Energy", market: "美股", position: "中游", sector: "能源/核电", positioning: "储能系统", observation: "数据中心PPA与订单质量", status: "行情覆盖", relationTypes: ["产业链"], relations: [] },
  { code: "AES", name: "The AES Corporation", market: "美股", position: "中游", sector: "能源/核电", positioning: "公用事业与可再生能源", observation: "数据中心客户合同", status: "行情覆盖", relationTypes: ["产业链"], relations: [] },
  { code: "SMR", name: "NuScale Power", market: "美股", position: "中游", sector: "能源/核电", positioning: "小型模块化反应堆", observation: "监管批文与首堆并网时间表", status: "行情覆盖", relationTypes: ["产业链"], relations: [] },
  { code: "OKLO", name: "Oklo", market: "美股", position: "中游", sector: "能源/核电", positioning: "微型反应堆", observation: "现金跑道与客户项目落地", status: "行情覆盖", relationTypes: ["产业链"], relations: [] },
  { code: "UUUU", name: "Energy Fuels", market: "美股", position: "中游", sector: "能源/核电", positioning: "铀矿与稀土", observation: "铀价与库存政策", status: "行情覆盖", relationTypes: ["产业链"], relations: [] },
  { code: "GOOG", name: "Alphabet", market: "美股", position: "下游", sector: "大模型/应用", positioning: "GCP、Gemini与TPU", observation: "自研芯片对成本结构的影响", status: "行情覆盖", relationTypes: ["产业链"], relations: [] },
  { code: "NOW", name: "ServiceNow", market: "美股", position: "下游", sector: "大模型/应用", positioning: "企业SaaS与AI工作流", observation: "AI净ARR增量", status: "行情覆盖", relationTypes: ["产业链"], relations: [] },
  { code: "SNOW", name: "Snowflake", market: "美股", position: "下游", sector: "大模型/应用", positioning: "云数据平台", observation: "AI ARR与消费增长", status: "行情覆盖", relationTypes: ["产业链"], relations: [] },
  { code: "LI", name: "Li Auto", market: "美股", position: "下游", sector: "智能车", positioning: "智能电动车", observation: "纯电产品节奏与毛利率", status: "行情覆盖", relationTypes: ["产业链"], relations: [] },
  { code: "XPEV", name: "XPeng", market: "美股", position: "下游", sector: "智能车", positioning: "智能驾驶与电动车", observation: "智驾订阅渗透与海外扩张", status: "行情覆盖", relationTypes: ["产业链"], relations: [] },
  { code: "COIN", name: "Coinbase Global", market: "美股", position: "下游", sector: "加密/区块链", positioning: "加密交易所", observation: "现货ETF净流入与衍生品业务", status: "行情覆盖", relationTypes: ["产业链"], relations: [] },
  { code: "RIOT", name: "Riot Platforms", market: "美股", position: "下游", sector: "加密/区块链", positioning: "矿企向AI算力转型", observation: "AI hosting合同占比", status: "行情覆盖", relationTypes: ["产业链"], relations: [] },
  { code: "BTDR", name: "Bitdeer Technologies", market: "美股", position: "下游", sector: "加密/区块链", positioning: "矿企与AI数据中心", observation: "AI hosting合同与电力资产价值", status: "行情覆盖", relationTypes: ["产业链"], relations: [] },
  { code: "IREN", name: "IREN Limited", market: "美股", position: "下游", sector: "加密/区块链", positioning: "矿企与AI云", observation: "AI云收入与数据中心扩产", status: "行情覆盖", relationTypes: ["产业链"], relations: [] },
  { code: "GLXY", name: "Galaxy Digital", market: "美股", position: "下游", sector: "加密/区块链", positioning: "加密金融服务", observation: "投行业务与自营仓位风险", status: "行情覆盖", relationTypes: ["产业链"], relations: [] },
  { code: "CRCL", name: "Circle Internet Group", market: "美股", position: "下游", sector: "加密/区块链", positioning: "USDC发行方", observation: "储备收益与利率敏感度", status: "行情覆盖", relationTypes: ["产业链"], relations: [] },
  { code: "RKLB", name: "Rocket Lab USA", market: "美股", position: "下游", sector: "国防/卫星", positioning: "火箭与卫星制造", observation: "Neutron首飞与订单backlog", status: "行情覆盖", relationTypes: ["产业链"], relations: [] },
  { code: "ASTS", name: "AST SpaceMobile", market: "美股", position: "下游", sector: "国防/卫星", positioning: "卫星直连手机", observation: "商业服务上线与融资需求", status: "行情覆盖", relationTypes: ["产业链"], relations: [] },
  { code: "PL", name: "Planet Labs PBC", market: "美股", position: "下游", sector: "国防/卫星", positioning: "遥感卫星与地理数据", observation: "政府合同续签与商业增长", status: "行情覆盖", relationTypes: ["产业链"], relations: [] },
  { code: "LMT", name: "Lockheed Martin", market: "美股", position: "下游", sector: "国防/卫星", positioning: "大型国防承包商", observation: "海外订单与弹药补库", status: "行情覆盖", relationTypes: ["产业链"], relations: [] },
  { code: "RTX", name: "RTX Corporation", market: "美股", position: "下游", sector: "国防/卫星", positioning: "航空航天与国防系统", observation: "海外订单、供应链与发动机成本", status: "行情覆盖", relationTypes: ["产业链"], relations: [] },
  { code: "AVAV", name: "AeroVironment", market: "美股", position: "下游", sector: "国防/卫星", positioning: "无人机与反无人机", observation: "战术无人机订单兑现", status: "行情覆盖", relationTypes: ["产业链"], relations: [] },
  { code: "SITM", name: "SiTime", market: "美股", position: "上游", sector: "半导体设备", positioning: "精密时钟与MEMS振荡器", observation: "AI数据中心时钟需求与估值", status: "行情覆盖", relationTypes: ["产业链"], relations: [] },
  { code: "RDDT", name: "Reddit", market: "美股", position: "下游", sector: "大模型/应用", positioning: "社区内容与AI数据授权", observation: "广告变现与数据授权持续性", status: "行情覆盖", relationTypes: ["产业链"], relations: [] },
  { code: "VECO", name: "Veeco Instruments", market: "美股", position: "上游", sector: "半导体设备", positioning: "激光退火、MOCVD与硅光设备", observation: "硅光订单、利润率与Axcelis并购", status: "行情覆盖", relationTypes: ["产业链"], relations: [] },
  { code: "CRDO", name: "Credo Technology", market: "美股", position: "上游", sector: "光模块/CPO", positioning: "AEC、SerDes与高速连接芯片", observation: "AEC放量、客户集中、光铜替代与估值", status: "行情覆盖", relationTypes: ["产业链"], relations: [] },
  { code: "ETN", name: "Eaton", market: "美股", position: "中游", sector: "数据中心/IDC", positioning: "配电、UPS与电气设备", observation: "数据中心订单、产能扩张、积压订单和估值", status: "行情覆盖", relationTypes: ["产业链"], relations: [] },
  { code: "AMKR", name: "Amkor Technology", market: "美股", position: "上游", sector: "封装测试/代工", positioning: "OSAT与先进封装服务", observation: "美国本土先进封装扩产、2.5D/3D封装客户导入、毛利率和资本开支兑现", status: "行情覆盖", relationTypes: ["产业链"], relations: [] },
  { code: "Q", name: "Qnity Electronics", market: "美股", position: "上游", sector: "半导体材料", positioning: "半导体与电子材料平台", observation: "晶圆制造耗材、先进封装材料、AI高性能计算材料需求和拆分后利润率", status: "行情覆盖", relationTypes: ["产业链"], relations: [] },
  { code: "ENTG", name: "Entegris", market: "美股", position: "上游", sector: "半导体材料", positioning: "晶圆制造材料、过滤与高纯工艺解决方案", observation: "先进制程材料、CMP/过滤/特气容器需求、美国本土供应链替代和库存周期", status: "行情覆盖", relationTypes: ["产业链"], relations: [] },
  { code: "300442", name: "润泽科技", market: "A股", position: "中游", sector: "服务器/算力", positioning: "自建自持AIDC、智算集群和液冷运维", observation: "AIDC收入与现金流、客户集中、REIT非经常收益、资本开支", status: "行情覆盖", relationTypes: ["产业链"], relations: [] },
  { code: "002028", name: "思源电气", market: "A股", position: "中游", sector: "能源/核电", positioning: "输配电、储能、电能质量与数据中心超级电容", observation: "新增订单、海外收入、数据中心超容批量放量、估值", status: "行情覆盖", relationTypes: ["产业链"], relations: [] },
  { code: "600875", name: "东方电气", market: "A股", position: "中游", sector: "能源/核电", positioning: "重型燃机、核电、储能和发电装备", observation: "燃机核电订单、海外突破、经营现金流和毛利率", status: "行情覆盖", relationTypes: ["产业链"], relations: [] },
  { code: "601985", name: "中国核电", market: "A股", position: "中游", sector: "能源/核电", positioning: "在运与在建核电资产、稳定电力现金流", observation: "机组核准投产、电价、利用小时、资本开支和负债", status: "行情覆盖", relationTypes: ["产业链"], relations: [] },
  { code: "688072", name: "拓荆科技", market: "A股", position: "上游", sector: "半导体设备", positioning: "薄膜沉积设备", observation: "PECVD/ALD验证、订单交付和估值", status: "行情覆盖", relationTypes: ["产业链"], relations: [] },
  { code: "300604", name: "长川科技", market: "A股", position: "上游", sector: "半导体设备", positioning: "测试机与分选机，承接先进封装测试扩容", observation: "高端测试机收入、存储测试、毛利率和客户验证", status: "行情覆盖", relationTypes: ["产业链"], relations: [] },
  { code: "688120", name: "华海清科", market: "A股", position: "上游", sector: "半导体设备", positioning: "CMP设备与减薄装备", observation: "CMP订单、先进封装设备放量和估值", status: "行情覆盖", relationTypes: ["产业链"], relations: [] },
  { code: "000988", name: "华工科技", market: "A股", position: "上游", sector: "光模块/CPO", positioning: "数通光模块、激光与传感", observation: "数通收入纯度、1.6T进展和估值", status: "行情覆盖", relationTypes: ["产业链"], relations: [] },
  { code: "688498", name: "源杰科技", market: "A股", position: "上游", sector: "光模块/CPO", positioning: "高速激光器芯片", observation: "100G/200G光芯片验证、良率和客户集中", status: "行情覆盖", relationTypes: ["产业链"], relations: [] },
  { code: "603228", name: "景旺电子", market: "A股", position: "上游", sector: "PCB/CCL", positioning: "多品类PCB与AI服务器板升级", observation: "AI数通收入、珠海产能、毛利率和客户结构", status: "行情覆盖", relationTypes: ["产业链"], relations: [] },
  { code: "301308", name: "江波龙", market: "A股", position: "上游", sector: "存储/HBM", positioning: "存储品牌、模组和企业级存储", observation: "企业级SSD、存储价格、库存和现金流", status: "行情覆盖", relationTypes: ["产业链"], relations: [] },
  { code: "688525", name: "佰维存储", market: "A股", position: "上游", sector: "存储/HBM", positioning: "嵌入式与高性能存储模组", observation: "AI端侧存储收入、价格周期和库存", status: "行情覆盖", relationTypes: ["产业链"], relations: [] },
  { code: "001309", name: "德明利", market: "A股", position: "上游", sector: "存储/HBM", positioning: "SSD与存储模组", observation: "NAND价格、库存、渠道结构和现金流", status: "行情覆盖", relationTypes: ["产业链"], relations: [] },
  { code: "000021", name: "深科技", market: "A股", position: "上游", sector: "存储/HBM", positioning: "存储模组制造与封装测试", observation: "企业级存储、封测收入、客户结构和利润率", status: "行情覆盖", relationTypes: ["产业链"], relations: [] },
  { code: "301018", name: "申菱环境", market: "A股", position: "中游", sector: "数据中心/IDC", positioning: "数据中心专用空调和液冷系统", observation: "数据中心收入、订单、回款和毛利率", status: "行情覆盖", relationTypes: ["产业链"], relations: [] },
  { code: "688676", name: "金盘科技", market: "A股", position: "中游", sector: "数据中心/IDC", positioning: "干式变压器、储能与数字化电力设备", observation: "数据中心订单、海外收入和回款", status: "行情覆盖", relationTypes: ["产业链"], relations: [] },
  { code: "002050", name: "三花智控", market: "A股", position: "下游", sector: "机器人/执行器", positioning: "热管理、执行器与机器人零部件", observation: "机器人量产、客户定点和汽车周期", status: "行情覆盖", relationTypes: ["产业链"], relations: [] },
  { code: "601689", name: "拓普集团", market: "A股", position: "下游", sector: "机器人/执行器", positioning: "底盘、热管理与机器人执行器映射", observation: "机器人量产、客户集中和汽车价格战", status: "行情覆盖", relationTypes: ["产业链"], relations: [] },
  { code: "688017", name: "绿的谐波", market: "A股", position: "下游", sector: "机器人/执行器", positioning: "谐波减速器", observation: "人形机器人订单、产能利用率和估值", status: "行情覆盖", relationTypes: ["产业链"], relations: [] },
  { code: "688322", name: "奥比中光", market: "A股", position: "下游", sector: "机器人/执行器", positioning: "3D视觉传感", observation: "机器人客户、量产收入和现金流", status: "行情覆盖", relationTypes: ["产业链"], relations: [] },
  { code: "003816", name: "中国广核", market: "A股", position: "中游", sector: "能源/核电", positioning: "核电站开发运营与稳定现金流", observation: "利用小时、电价、机组投产和资本开支", status: "行情覆盖", relationTypes: ["产业链"], relations: [] },
  { code: "002179", name: "中航光电", market: "A股", position: "下游", sector: "国防/卫星", positioning: "航空航天与高可靠连接器", observation: "军品订单、民品高速连接、回款和估值", status: "行情覆盖", relationTypes: ["产业链"], relations: [] },
  { code: "688297", name: "中无人机", market: "A股", position: "下游", sector: "国防/卫星", positioning: "大型固定翼无人机系统", observation: "出口订单、交付节奏和应收账款", status: "行情覆盖", relationTypes: ["产业链"], relations: [] },
  { code: "002389", name: "航天彩虹", market: "A股", position: "下游", sector: "国防/卫星", positioning: "无人机系统与膜材料", observation: "无人机订单、交付、现金流和业务纯度", status: "行情覆盖", relationTypes: ["产业链"], relations: [] },
  { code: "600111", name: "北方稀土", market: "A股", position: "上游", sector: "战略材料/资源", positioning: "轻稀土资源、冶炼分离和价格弹性", observation: "氧化镨钕价格、配额、库存、磁材需求和盈利弹性", status: "行情覆盖", relationTypes: ["产业链"], relations: [] },
  { code: "000657", name: "中钨高新", market: "A股", position: "上游", sector: "战略材料/资源", positioning: "钨矿、粉末、硬质合金、PCB微钻和高端刀具", observation: "钨价、PCB刀具、硬质合金利润率、现金流和回调幅度", status: "行情覆盖", relationTypes: ["产业链"], relations: [] },
  { code: "000962", name: "东方钽业", market: "A股", position: "上游", sector: "战略材料/资源", positioning: "钽粉、钽丝、钽铌制品和电容器材料", observation: "高比容钽粉、电子材料收入、原料保障和经营现金流", status: "行情覆盖", relationTypes: ["产业链"], relations: [] },
  { code: "002428", name: "云南锗业", market: "A股", position: "上游", sector: "战略材料/资源", positioning: "锗矿、四氯化锗、红外光学和化合物半导体材料", observation: "锗价、光纤级产品、红外订单、扣非利润和经营现金流", status: "行情覆盖", relationTypes: ["产业链"], relations: [] },
  { code: "300285", name: "国瓷材料", market: "A股", position: "上游", sector: "半导体材料", positioning: "MLCC介质粉体、电子浆料和纳米氧化锆", observation: "AI服务器MLCC材料验证、扩产、利润兑现和估值", status: "行情覆盖", relationTypes: ["产业链"], relations: [] },
  { code: "002156", name: "通富微电", market: "A股", position: "上游", sector: "封装测试/代工", positioning: "AMD深度合作、逻辑与存储芯片封测及先进封装", observation: "AMD订单、中高端产品收入、先进封装、资本开支和经营现金流", status: "行情覆盖", relationTypes: ["产业链"], relations: [] },
  { code: "605090", name: "九丰能源", market: "A股", position: "上游", sector: "半导体材料", positioning: "LNG/LPG主业及高纯氦气资源与终端供应", observation: "氦气产销量与价格、特气利润占比、LNG周期和经营现金流", status: "行情覆盖", relationTypes: ["产业链"], relations: [] },
  { code: "300602", name: "飞荣达", market: "A股", position: "上游", sector: "数据中心/IDC", positioning: "液冷板、CDU及电磁屏蔽与热管理器件", observation: "液冷收入纯度、冷板与CDU放量、毛利率和客户集中", status: "行情覆盖", relationTypes: ["产业链"], relations: [] },
  { code: "300990", name: "同飞股份", market: "A股", position: "中游", sector: "数据中心/IDC", positioning: "冷板及浸没液冷方案、CDU、冷站和换热设备", observation: "数据中心收入、CDU订单、利润增长和客户验证", status: "行情覆盖", relationTypes: ["产业链"], relations: [] },
  { code: "920808", name: "曙光数创", market: "A股", position: "中游", sector: "数据中心/IDC", positioning: "浸没与冷板液冷基础设施、室外冷却及预制管路", observation: "冷板液冷毛利率、海外订单、客户集中、回款和亏损收窄", status: "行情覆盖", relationTypes: ["产业链"], relations: [] },
  { code: "688535", name: "华海诚科", market: "A股", position: "上游", sector: "半导体材料", positioning: "环氧塑封料、底部填充等先进封装材料", observation: "HBM/Chiplet封装材料收入、客户验证、毛利率", status: "行情覆盖", relationTypes: ["产业链"], relations: [] },
  { code: "688019", name: "安集科技", market: "A股", position: "上游", sector: "半导体设备", positioning: "CMP抛光液、湿电子化学品、电镀液和添加剂", observation: "CMP和先进封装耗材放量、先进制程客户验证、回踩是否企稳", status: "行情覆盖", relationTypes: ["产业链"], relations: [] },
  { code: "300054", name: "鼎龙股份", market: "A股", position: "上游", sector: "半导体设备", positioning: "CMP抛光垫、抛光液和半导体显示材料", observation: "CMP耗材收入、国产替代进度、盈利兑现", status: "行情覆盖", relationTypes: ["产业链"], relations: [] },
  { code: "688300", name: "联瑞新材", market: "A股", position: "上游", sector: "半导体材料", positioning: "球形硅微粉、氧化铝等功能性粉体", observation: "高频高速CCL和先进封装粉体收入、产能和价格", status: "行情覆盖", relationTypes: ["产业链"], relations: [] },
  { code: "300666", name: "江丰电子", market: "A股", position: "上游", sector: "半导体设备", positioning: "超高纯金属溅射靶材和半导体精密零部件", observation: "先进制程靶材客户验证、海外客户收入、估值", status: "行情覆盖", relationTypes: ["产业链"], relations: [] },
  { code: "688268", name: "华特气体", market: "A股", position: "上游", sector: "半导体材料", positioning: "光刻、蚀刻、成膜和掺杂用高纯电子特气", observation: "高端特气认证、价格和盈利恢复", status: "行情覆盖", relationTypes: ["产业链"], relations: [] },
  { code: "688106", name: "金宏气体", market: "A股", position: "上游", sector: "半导体材料", positioning: "大宗气体、电子特气和现场制气服务", observation: "电子特气收入占比、客户认证、价格、现金流", status: "行情覆盖", relationTypes: ["产业链"], relations: [] },
  { code: "002409", name: "雅克科技", market: "A股", position: "上游", sector: "半导体材料", positioning: "前驱体、光刻胶配套材料、LNG保温和电子材料平台", observation: "半导体材料收入、存储客户景气、前驱体放量和回踩幅度", status: "行情覆盖", relationTypes: ["产业链"], relations: [] },
  { code: "600206", name: "有研新材", market: "A股", position: "上游", sector: "半导体材料", positioning: "靶材、稀贵金属和半导体功能材料", observation: "靶材和稀贵材料盈利、客户验证、资源价格和回撤确认", status: "行情覆盖", relationTypes: ["产业链"], relations: [] },
  { code: "300346", name: "南大光电", market: "A股", position: "上游", sector: "半导体材料", positioning: "前驱体、电子特气、光刻胶及配套材料", observation: "ArF光刻胶验证、前驱体和特气收入、回踩后强弱", status: "行情覆盖", relationTypes: ["产业链"], relations: [] },
  { code: "300236", name: "上海新阳", market: "A股", position: "上游", sector: "半导体材料", positioning: "电镀液、清洗液、光刻胶配套和晶圆制造化学品", observation: "湿化学品和电镀液订单、先进封装应用、回踩承接和估值", status: "行情覆盖", relationTypes: ["产业链"], relations: [] },
  { code: "300408", name: "三环集团", market: "A股", position: "上游", sector: "半导体材料", positioning: "MLCC陶瓷材料、陶瓷基板和电子陶瓷元件", observation: "AI服务器MLCC需求、陶瓷基板收入、回踩是否企稳", status: "行情覆盖", relationTypes: ["产业链"], relations: [] },
  { code: "002436", name: "兴森科技", market: "A股", position: "上游", sector: "PCB/CCL", positioning: "IC封装基板、样板和高速PCB", observation: "封装基板稼动率、ABF/BT产品、客户验证和现金流", status: "行情覆盖", relationTypes: ["产业链"], relations: [] },
  { code: "603256", name: "宏和科技", market: "A股", position: "上游", sector: "PCB/CCL", positioning: "高端电子级玻纤布和低介电电子布", observation: "低介电电子布价格、产能、客户验证和高位风险", status: "行情覆盖", relationTypes: ["产业链"], relations: [] },
  { code: "605589", name: "圣泉集团", market: "A股", position: "上游", sector: "PCB/CCL", positioning: "酚醛树脂、特种环氧树脂和电子材料", observation: "电子树脂收入、AI服务器CCL映射、价格和回踩承接", status: "行情覆盖", relationTypes: ["产业链"], relations: [] },
  { code: "301217", name: "铜冠铜箔", market: "A股", position: "上游", sector: "PCB/CCL", positioning: "PCB用电子铜箔和锂电铜箔", observation: "高速铜箔订单、加工费、锂电拖累、极高拥挤度", status: "行情覆盖", relationTypes: ["产业链"], relations: [] },
  { code: "301511", name: "德福科技", market: "A股", position: "上游", sector: "PCB/CCL", positioning: "电子电路铜箔和锂电铜箔", observation: "高速铜箔产品占比、加工费、锂电铜箔景气和现金流", status: "行情覆盖", relationTypes: ["产业链"], relations: [] },
  // ===== P2 补票:补齐主线龙头/妖股(国产GPU/服务器/封测/铜连接/HBM/交换芯片/HVDC/设备/光/丝杠电机/应用)=====
  { code: "300474", name: "景嘉微", market: "A股", position: "上游", sector: "AI芯片/GPU", positioning: "国产GPU稀缺标的,军用+信创图形处理器", observation: "国产GPU放量、信创订单、对标英伟达替代逻辑", status: "行情覆盖", relationTypes: ["A股映射", "产业链"], relations: ["NVDA", "寒武纪"] },
  { code: "603019", name: "中科曙光", market: "A股", position: "中游", sector: "服务器/算力", positioning: "国产算力整机龙头,海光与曙光数创母公司", observation: "国产服务器招标、液冷一体机、昇腾/海光生态", status: "行情覆盖", relationTypes: ["A股映射", "产业链"], relations: ["NVDA", "海光信息", "浪潮信息"] },
  { code: "600584", name: "长电科技", market: "A股", position: "上游", sector: "封装测试/代工", positioning: "全球封测龙头,先进封装产能核心", observation: "先进封装稼动率、AI芯片封装订单、国产替代", status: "行情覆盖", relationTypes: ["A股映射", "产业链"], relations: ["TSM", "通富微电", "华天科技"] },
  { code: "002185", name: "华天科技", market: "A股", position: "上游", sector: "封装测试/代工", positioning: "封测三巨头之一,先进封装布局", observation: "先进封装放量、稼动率、AI/存储封装需求", status: "行情覆盖", relationTypes: ["A股映射", "产业链"], relations: ["TSM", "长电科技", "通富微电"] },
  { code: "002130", name: "沃尔核材", market: "A股", position: "中游", sector: "铜连接/高速互连", positioning: "高速铜缆/铜连接龙头,GB200铜背板核心", observation: "高速铜缆订单、英伟达GB系统放量、游资拥挤度高", status: "行情覆盖", relationTypes: ["A股映射", "产业链"], relations: ["NVDA", "CRDO", "立讯精密"] },
  { code: "300679", name: "电连技术", market: "A股", position: "中游", sector: "铜连接/高速互连", positioning: "高速连接器/铜缆组件,对标CRDO", observation: "高速铜缆AEC订单、GB200/NVL72放量、海外验证", status: "行情覆盖", relationTypes: ["A股映射", "产业链"], relations: ["NVDA", "CRDO", "立讯精密"] },
  { code: "300563", name: "神宇股份", market: "A股", position: "中游", sector: "铜连接/高速互连", positioning: "高速线缆/同轴线材,铜连接二线弹性", observation: "高速铜缆切入、下游验证、跟随铜连接主线", status: "行情覆盖", relationTypes: ["产业链"], relations: ["沃尔核材", "NVDA"] },
  { code: "300475", name: "香农芯创", market: "A股", position: "中游", sector: "存储/HBM", positioning: "海力士存储代理+算力,A股HBM影子股", observation: "HBM/DDR5代理放量、存储涨价、算力业务进展", status: "行情覆盖", relationTypes: ["A股映射", "产业链"], relations: ["MU", "澜起科技"] },
  { code: "600667", name: "太极实业", market: "A股", position: "中游", sector: "存储/HBM", positioning: "海力士无锡封测合资,HBM后道配套", observation: "海力士稼动率、HBM后道封测、工程业务", status: "行情覆盖", relationTypes: ["A股映射", "产业链"], relations: ["MU", "香农芯创"] },
  { code: "688702", name: "盛科通信", market: "A股", position: "上游", sector: "交换机/网络", positioning: "国产交换芯片唯一标的,对标博通Tomahawk", observation: "国产交换芯片放量、800G/1.6T、信创网络替代", status: "行情覆盖", relationTypes: ["A股映射", "产业链"], relations: ["AVGO", "ANET", "中兴通讯"] },
  { code: "300693", name: "盛弘股份", market: "A股", position: "中游", sector: "电源/HVDC", positioning: "数据中心HVDC/电力电子,对标Vertiv电力侧", observation: "HVDC/巴拿马电源、数据中心供配电、储能", status: "行情覆盖", relationTypes: ["A股映射", "产业链"], relations: ["VRT", "麦格米特"] },
  { code: "002518", name: "科士达", market: "A股", position: "中游", sector: "电源/HVDC", positioning: "数据中心UPS/供配电+储能", observation: "数据中心电力订单、UPS/HVDC、储能业务", status: "行情覆盖", relationTypes: ["A股映射", "产业链"], relations: ["VRT", "盛弘股份"] },
  { code: "688082", name: "盛美上海", market: "A股", position: "上游", sector: "半导体设备", positioning: "清洗设备龙头,半导体前道设备平台", observation: "清洗设备订单、国产替代、新品类放量", status: "行情覆盖", relationTypes: ["A股映射", "产业链"], relations: ["AMAT", "北方华创"] },
  { code: "688037", name: "芯源微", market: "A股", position: "上游", sector: "半导体设备", positioning: "涂胶显影设备唯一标的,光刻配套", observation: "涂胶显影订单、前道设备国产化、客户验证", status: "行情覆盖", relationTypes: ["A股映射", "产业链"], relations: ["北方华创", "拓荆科技"] },
  { code: "300620", name: "光库科技", market: "A股", position: "上游", sector: "光模块/CPO", positioning: "薄膜铌酸锂/光器件,CPO与相干光核心", observation: "TFLN调制器、CPO上游、海外光器件订单", status: "行情覆盖", relationTypes: ["A股映射", "产业链"], relations: ["COHR", "新易盛"] },
  { code: "603083", name: "剑桥科技", market: "A股", position: "中游", sector: "光模块/CPO", positioning: "数通光模块+硅光/CPO概念", observation: "CPO/硅光进展、数通光模块出货、海外客户", status: "行情覆盖", relationTypes: ["产业链"], relations: ["中际旭创", "新易盛"] },
  { code: "688313", name: "仕佳光子", market: "A股", position: "上游", sector: "光模块/CPO", positioning: "光分路器芯片/MPO,光模块上游", observation: "光芯片国产化、MPO/AWG订单、CPO配套", status: "行情覆盖", relationTypes: ["产业链"], relations: ["源杰科技", "天孚通信"] },
  { code: "002472", name: "双环传动", market: "A股", position: "中游", sector: "机器人/执行器", positioning: "齿轮/减速器龙头,人形机器人执行器", observation: "RV减速器、丝杠布局、特斯拉Optimus供应链", status: "行情覆盖", relationTypes: ["A股映射", "产业链"], relations: ["TSLA", "绿的谐波"] },
  { code: "603667", name: "五洲新春", market: "A股", position: "中游", sector: "机器人/执行器", positioning: "轴承+丝杠,机器人执行器二线", observation: "行星滚柱丝杠、轴承、Optimus供应链验证", status: "行情覆盖", relationTypes: ["产业链"], relations: ["TSLA", "双环传动"] },
  { code: "603728", name: "鸣志电器", market: "A股", position: "中游", sector: "机器人/执行器", positioning: "空心杯/步进电机,机器人电机核心", observation: "空心杯电机、人形机器人电机、海外订单", status: "行情覆盖", relationTypes: ["A股映射", "产业链"], relations: ["TSLA", "汇川技术"] },
  { code: "003021", name: "兆威机电", market: "A股", position: "中游", sector: "机器人/执行器", positioning: "微型传动/灵巧手核心", observation: "灵巧手传动、微型减速器、机器人放量", status: "行情覆盖", relationTypes: ["产业链"], relations: ["TSLA", "绿的谐波"] },
  { code: "300418", name: "昆仑万维", market: "A股", position: "下游", sector: "大模型/应用", positioning: "国产大模型+AIGC应用平台", observation: "天工大模型、AIGC产品商业化、出海", status: "行情覆盖", relationTypes: ["产业链"], relations: ["科大讯飞", "金山办公"] },
  { code: "601360", name: "三六零", market: "A股", position: "下游", sector: "大模型/应用", positioning: "安全+大模型,AI应用落地", observation: "360智脑、AI搜索/应用、政企订单", status: "行情覆盖", relationTypes: ["产业链"], relations: ["科大讯飞"] },
  { code: "002415", name: "海康威视", market: "A股", position: "下游", sector: "端侧AI/SoC", positioning: "安防+AI视觉龙头,AI落地标杆", observation: "AI视觉硬件、大模型行业落地、海外与企业数字化", status: "行情覆盖", relationTypes: ["A股映射", "产业链"], relations: ["NVDA"] },
  { code: "688362", name: "甬矽电子", market: "A股", position: "上游", sector: "封装测试/代工", positioning: "先进封装二线,SiP/倒装布局", observation: "先进封装放量、稼动率、AI/存储封装", status: "行情覆盖", relationTypes: ["产业链"], relations: ["长电科技", "通富微电"] },
];

// 基于代码的确定性哈希,用于生成稳定的模拟行情
function hash(str: string): number {
  let h = 0;
  for (let i = 0; i < str.length; i++) {
    h = (h * 31 + str.charCodeAt(i)) >>> 0;
  }
  return h;
}

function withQuote(s: StockBase): Stock {
  const h = hash(s.code + s.name);
  // 价格:美股 50-450,A股 8-200
  const price =
    s.market === "美股"
      ? Math.round((50 + (h % 400) + (h % 100) / 100) * 100) / 100
      : Math.round((8 + (h % 192) + (h % 100) / 100) * 100) / 100;
  // 涨跌:-6% ~ +6%
  const change = Math.round(((((h >> 3) % 1200) - 600) / 100) * 100) / 100;
  return { ...s, price, change, live: false, retailTake: makeRetailTake(s) };
}

export const STOCKS: Stock[] = STOCKS_BASE.map(withQuote);

export const STOCK_MAP: Record<string, Stock> = Object.fromEntries(
  STOCKS.map((s) => [s.code, s])
);

export const STOCK_BY_NAME: Record<string, Stock> = Object.fromEntries(
  STOCKS.map((s) => [s.name, s])
);

// relations 里既可能是代码(A股引用美股 ticker),也可能是名称(美股引用A股名)
export function resolvePeer(token: string): Stock | undefined {
  return STOCK_MAP[token] ?? STOCK_BY_NAME[token];
}

// 一只美股对应的 A 股标的(双向取并集)
export function aSharePeers(us: Stock): Stock[] {
  const out = new Map<string, Stock>();
  us.relations.forEach((t) => {
    const p = resolvePeer(t);
    if (p && p.market === "A股") out.set(p.code, p);
  });
  STOCKS.forEach((s) => {
    if (
      s.market === "A股" &&
      (s.relations.includes(us.code) || s.relations.includes(us.name))
    ) {
      out.set(s.code, s);
    }
  });
  return Array.from(out.values());
}

// 转新浪行情代码:A股 sh/sz/bj 前缀,美股 gb_<ticker>
export function sinaSymbol(s: Pick<Stock, "code" | "market">): string {
  if (s.market === "美股") return `gb_${s.code.toLowerCase()}`;
  const c = s.code;
  // 6/9=沪市股票,5=沪市基金/ETF(51x/56x/58x/588 科创),都走 sh
  if (c.startsWith("6") || c.startsWith("9") || c.startsWith("5")) return `sh${c}`;
  if (c.startsWith("4") || c.startsWith("8")) return `bj${c}`;
  // 其余:深市股票(0/3)与深市 ETF(15x/16x)走 sz
  return `sz${c}`;
}
