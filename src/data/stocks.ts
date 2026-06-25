// AI 产业链股票池种子数据
// 行情(price/change)用基于股票代码的确定性算法生成,模拟"行情已连接"状态,
// 后续接入真实行情(AKShare / Polygon.io)时替换 withQuote() 即可。

export type Market = "美股" | "A股";
export type Position = "上游" | "中游" | "下游";

// 16 个 AI 产业链板块
export const SECTORS = [
  "AI芯片/GPU",
  "CPU",
  "光模块/CPO",
  "服务器/算力设备",
  "存储",
  "PCB/载板",
  "半导体设备",
  "EDA/IP",
  "液冷/温控",
  "电源/能源",
  "交换机/网络",
  "云计算/IDC",
  "大模型/应用",
  "端侧AI",
  "机器人/具身",
  "代工/封测",
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
  "688041": "国产算力禁令下最直接的受益标的,情绪来时弹性大。但 PE 高、波动剧烈,追高需谨慎,适合等回调而非追板。",
  "688256": "纯国产 AI 芯片标的,题材一来涨得猛、跌得也狠。属于高 beta 情绪票,仓位要控制,别当压舱石拿。",
  "300308": "光模块全球龙头,跟英伟达/海外云厂资本开支高度绑定。海外财报超预期时它最先反应,但已连涨时追高要小心。",
  "300502": "光模块第二极,弹性比龙头更大。海外订单占比高,美股科技股大跌时它也容易被错杀,可逢回调关注。",
  "601138": "AI 服务器代工龙头,出货量是算力景气度的体温计。盘子大、相对稳,适合作为 AI 链里偏稳的配置。",
  "000977": "国产 AI 服务器龙头,国产算力放量的直接受益者。跟着政策和大厂招标节奏走,消息驱动明显。",
  "002837": "液冷温控龙头,算力越堆越多、散热越刚需,逻辑顺。属于二线弹性,跟随主线情绪,不宜单独追高。",
  "688981": "国产代工龙头,更多是国产替代的长期叙事而非短期业绩弹性,适合长期观察、回调布局。",
  "002230": "国产大模型代表,题材属性强、业绩兑现慢。情绪票,跟着 AI 应用主题炒,落袋为安比死扛重要。",
};

function makeRetailTake(s: StockBase): string {
  if (RETAIL_TAKES[s.code]) return RETAIL_TAKES[s.code];
  const role =
    s.position === "上游"
      ? "偏产业链上游,业绩兑现相对靠后"
      : s.position === "中游"
      ? "处在产业链中游,跟主线情绪同步性强"
      : "偏下游应用,更多是题材和需求驱动";
  return `${s.sector}板块标的,${role}。${s.observation};短期跟随板块情绪波动,不构成投资建议。`;
}

const STOCKS_BASE: StockBase[] = [
  // ===== 美股 =====
  { code: "NVDA", name: "英伟达", market: "美股", position: "上游", sector: "AI芯片/GPU", positioning: "AI 算力霸主,GPU 绝对龙头", observation: "数据中心收入持续高增,定义全球算力节奏", status: "今日有新消息", relationTypes: ["产业链", "资本开支", "A股映射"], relations: ["中际旭创", "工业富联", "海光信息"] },
  { code: "AMD", name: "超威半导体", market: "美股", position: "上游", sector: "AI芯片/GPU", positioning: "GPU 第二极,MI 系列对标英伟达", observation: "MI300/MI350 放量节奏决定第二供应商逻辑", status: "行情覆盖", relationTypes: ["产业链"], relations: ["海光信息", "寒武纪"] },
  { code: "AVGO", name: "博通", market: "美股", position: "上游", sector: "交换机/网络", positioning: "定制 ASIC + 网络芯片双轮", observation: "云厂自研芯片代工核心受益者", status: "行情覆盖", relationTypes: ["产业链", "资本开支"], relations: ["中兴通讯"] },
  { code: "TSM", name: "台积电", market: "美股", position: "上游", sector: "代工/封测", positioning: "先进制程独家代工", observation: "CoWoS 封装产能是算力供给瓶颈", status: "行情覆盖", relationTypes: ["产业链"], relations: ["中芯国际"] },
  { code: "ASML", name: "阿斯麦", market: "美股", position: "上游", sector: "半导体设备", positioning: "EUV 光刻机独家供应", observation: "设备订单是产业链景气度前瞻指标", status: "行情覆盖", relationTypes: ["产业链"], relations: ["北方华创"] },
  { code: "MU", name: "美光", market: "美股", position: "上游", sector: "存储", positioning: "HBM 高带宽存储三巨头之一", observation: "HBM 供不应求,绑定 GPU 出货", status: "行情覆盖", relationTypes: ["产业链"], relations: ["兆易创新", "澜起科技"] },
  { code: "MRVL", name: "迈威尔", market: "美股", position: "上游", sector: "光模块/CPO", positioning: "光 DSP + 定制芯片", observation: "光互连与定制 ASIC 双逻辑", status: "行情覆盖", relationTypes: ["产业链"], relations: ["新易盛", "天孚通信"] },
  { code: "ARM", name: "Arm", market: "美股", position: "上游", sector: "EDA/IP", positioning: "全球 CPU 架构 IP 授权", observation: "端侧与服务器架构渗透", status: "行情覆盖", relationTypes: ["产业链"], relations: ["瑞芯微"] },
  { code: "INTC", name: "英特尔", market: "美股", position: "上游", sector: "CPU", positioning: "x86 CPU 老牌龙头", observation: "代工转型与 AI PC 双线承压", status: "长期观察", relationTypes: ["产业链"], relations: ["海光信息"] },
  { code: "SMCI", name: "超微电脑", market: "美股", position: "中游", sector: "服务器/算力设备", positioning: "AI 服务器整机弹性标的", observation: "液冷服务器放量,业绩与算力强相关", status: "行情覆盖", relationTypes: ["产业链", "资本开支"], relations: ["工业富联", "浪潮信息"] },
  { code: "DELL", name: "戴尔", market: "美股", position: "中游", sector: "服务器/算力设备", positioning: "企业级 AI 服务器主力", observation: "AI 服务器订单 backlog 创新高", status: "行情覆盖", relationTypes: ["资本开支"], relations: ["浪潮信息"] },
  { code: "ANET", name: "Arista", market: "美股", position: "中游", sector: "交换机/网络", positioning: "数据中心高速交换机龙头", observation: "800G 交换升级,绑定云厂扩容", status: "行情覆盖", relationTypes: ["产业链", "资本开支"], relations: ["中兴通讯", "紫光股份"] },
  { code: "VRT", name: "Vertiv", market: "美股", position: "中游", sector: "液冷/温控", positioning: "数据中心液冷与供配电", observation: "液冷渗透率提升直接受益", status: "今日有新消息", relationTypes: ["资本开支", "电力映射"], relations: ["英维克", "科华数据"] },
  { code: "MSFT", name: "微软", market: "美股", position: "下游", sector: "云计算/IDC", positioning: "Azure + OpenAI 算力买方", observation: "资本开支指引是算力链晴雨表", status: "行情覆盖", relationTypes: ["资本开支"], relations: ["中际旭创"] },
  { code: "GOOGL", name: "谷歌", market: "美股", position: "下游", sector: "云计算/IDC", positioning: "自研 TPU + 云需求", observation: "TPU 路线影响定制芯片格局", status: "行情覆盖", relationTypes: ["资本开支", "产业链"], relations: ["工业富联"] },
  { code: "AMZN", name: "亚马逊", market: "美股", position: "下游", sector: "云计算/IDC", positioning: "AWS 全球最大云厂", observation: "自研 Trainium 与外采并行", status: "行情覆盖", relationTypes: ["资本开支"], relations: [] },
  { code: "META", name: "Meta", market: "美股", position: "下游", sector: "大模型/应用", positioning: "开源大模型 + 巨额算力投入", observation: "Capex 大幅上修,GPU 采购大户", status: "今日有新消息", relationTypes: ["资本开支"], relations: ["中际旭创", "新易盛"] },
  { code: "ORCL", name: "甲骨文", market: "美股", position: "下游", sector: "云计算/IDC", positioning: "OCI 云 + RPO 暴增", observation: "RPO 订单验证算力需求真实性", status: "今日有新消息", relationTypes: ["资本开支"], relations: [] },
  { code: "PLTR", name: "Palantir", market: "美股", position: "下游", sector: "大模型/应用", positioning: "AI 落地应用平台", observation: "商业化变现节奏受关注", status: "行情覆盖", relationTypes: ["主题关联"], relations: ["科大讯飞"] },
  { code: "TSLA", name: "特斯拉", market: "美股", position: "下游", sector: "机器人/具身", positioning: "FSD + 人形机器人 Optimus", observation: "具身智能主题映射 A 股", status: "行情覆盖", relationTypes: ["主题关联"], relations: ["埃斯顿", "汇川技术"] },
  { code: "CRWV", name: "CoreWeave", market: "美股", position: "下游", sector: "云计算/IDC", positioning: "纯 GPU 云租赁新贵", observation: "算力租赁模式扩张激进", status: "行情覆盖", relationTypes: ["资本开支"], relations: [] },
  { code: "COHR", name: "相干", market: "美股", position: "中游", sector: "光模块/CPO", positioning: "光器件与光芯片", observation: "光通信上游,绑定光模块景气", status: "行情覆盖", relationTypes: ["产业链"], relations: ["光迅科技"] },
  { code: "LRCX", name: "泛林半导体", market: "美股", position: "上游", sector: "半导体设备", positioning: "刻蚀设备龙头", observation: "存储扩产带动设备需求", status: "行情覆盖", relationTypes: ["产业链"], relations: ["中微公司"] },
  { code: "AMAT", name: "应用材料", market: "美股", position: "上游", sector: "半导体设备", positioning: "全球最大半导体设备商", observation: "先进制程设备风向标", status: "行情覆盖", relationTypes: ["产业链"], relations: ["北方华创"] },
  { code: "CDNS", name: "Cadence", market: "美股", position: "上游", sector: "EDA/IP", positioning: "EDA 工具双寡头之一", observation: "AI 芯片设计离不开 EDA", status: "行情覆盖", relationTypes: ["产业链"], relations: ["华大九天"] },
  { code: "SNPS", name: "新思科技", market: "美股", position: "上游", sector: "EDA/IP", positioning: "EDA 工具双寡头之一", observation: "AI 辅助设计渗透", status: "行情覆盖", relationTypes: ["产业链"], relations: ["华大九天"] },
  { code: "DLR", name: "Digital Realty", market: "美股", position: "下游", sector: "云计算/IDC", positioning: "全球数据中心 REIT", observation: "IDC 上架率与电力供给", status: "长期观察", relationTypes: ["电力映射"], relations: [] },

  // ===== A股 =====
  { code: "688041", name: "海光信息", market: "A股", position: "上游", sector: "CPU", positioning: "国产 CPU/DCU,英伟达在华替代", observation: "国产算力禁令下最直接受益,估值偏高", status: "今日有新消息", relationTypes: ["A股映射", "主题关联"], relations: ["NVDA", "AMD", "INTC"] },
  { code: "688256", name: "寒武纪", market: "A股", position: "上游", sector: "AI芯片/GPU", positioning: "国产 AI 芯片纯标的", observation: "订单放量验证国产替代,波动极大", status: "今日有新消息", relationTypes: ["A股映射", "主题关联"], relations: ["NVDA", "AMD"] },
  { code: "000977", name: "浪潮信息", market: "A股", position: "中游", sector: "服务器/算力设备", positioning: "国产 AI 服务器龙头", observation: "对标超微/戴尔,算力扩容核心", status: "行情覆盖", relationTypes: ["A股映射", "资本开支"], relations: ["SMCI", "DELL"] },
  { code: "601138", name: "工业富联", market: "A股", position: "中游", sector: "服务器/算力设备", positioning: "全球 AI 服务器代工龙头", observation: "绑定英伟达/云厂,出货量风向标", status: "今日有新消息", relationTypes: ["A股映射", "产业链"], relations: ["NVDA", "GOOGL"] },
  { code: "300308", name: "中际旭创", market: "A股", position: "中游", sector: "光模块/CPO", positioning: "全球光模块龙头", observation: "800G/1.6T 升级核心,跟随英伟达节奏", status: "今日有新消息", relationTypes: ["A股映射", "产业链"], relations: ["NVDA", "MSFT", "META"] },
  { code: "300502", name: "新易盛", market: "A股", position: "中游", sector: "光模块/CPO", positioning: "光模块第二极,高速率弹性", observation: "海外云厂订单占比高", status: "今日有新消息", relationTypes: ["A股映射", "产业链"], relations: ["MRVL", "META"] },
  { code: "300394", name: "天孚通信", market: "A股", position: "中游", sector: "光模块/CPO", positioning: "光器件平台型公司", observation: "光模块上游配套,毛利率高", status: "行情覆盖", relationTypes: ["产业链"], relations: ["MRVL"] },
  { code: "002281", name: "光迅科技", market: "A股", position: "上游", sector: "光模块/CPO", positioning: "光芯片+光模块国家队", observation: "国产光芯片自主可控", status: "行情覆盖", relationTypes: ["产业链"], relations: ["COHR"] },
  { code: "300570", name: "太辰光", market: "A股", position: "中游", sector: "光模块/CPO", positioning: "无源光器件", observation: "MPO 跳线受益高速互连", status: "长期观察", relationTypes: ["产业链"], relations: [] },
  { code: "002463", name: "沪电股份", market: "A股", position: "上游", sector: "PCB/载板", positioning: "AI 服务器高多层 PCB", observation: "算力 PCB 价值量提升", status: "行情覆盖", relationTypes: ["产业链"], relations: ["NVDA"] },
  { code: "002916", name: "深南电路", market: "A股", position: "上游", sector: "PCB/载板", positioning: "PCB + 封装基板", observation: "高端载板国产替代", status: "行情覆盖", relationTypes: ["产业链"], relations: [] },
  { code: "300476", name: "胜宏科技", market: "A股", position: "上游", sector: "PCB/载板", positioning: "高阶 HDI/PCB", observation: "AI 板卡订单弹性", status: "今日有新消息", relationTypes: ["产业链"], relations: ["NVDA"] },
  { code: "600183", name: "生益科技", market: "A股", position: "上游", sector: "PCB/载板", positioning: "覆铜板龙头", observation: "高频高速材料受益", status: "行情覆盖", relationTypes: ["产业链"], relations: [] },
  { code: "688981", name: "中芯国际", market: "A股", position: "上游", sector: "代工/封测", positioning: "国产晶圆代工龙头", observation: "先进制程国产化核心", status: "行情覆盖", relationTypes: ["A股映射", "产业链"], relations: ["TSM"] },
  { code: "002371", name: "北方华创", market: "A股", position: "上游", sector: "半导体设备", positioning: "国产半导体设备龙头", observation: "刻蚀/薄膜平台,扩产受益", status: "行情覆盖", relationTypes: ["A股映射", "产业链"], relations: ["AMAT", "ASML"] },
  { code: "688012", name: "中微公司", market: "A股", position: "上游", sector: "半导体设备", positioning: "刻蚀设备国产龙头", observation: "先进制程刻蚀突破", status: "行情覆盖", relationTypes: ["产业链"], relations: ["LRCX"] },
  { code: "603986", name: "兆易创新", market: "A股", position: "上游", sector: "存储", positioning: "存储+MCU 国产龙头", observation: "存储涨价周期弹性", status: "行情覆盖", relationTypes: ["产业链"], relations: ["MU"] },
  { code: "688008", name: "澜起科技", market: "A股", position: "上游", sector: "存储", positioning: "内存接口芯片全球龙头", observation: "DDR5/HBM 配套受益", status: "今日有新消息", relationTypes: ["产业链"], relations: ["MU"] },
  { code: "300661", name: "圣邦股份", market: "A股", position: "上游", sector: "AI芯片/GPU", positioning: "模拟芯片平台型龙头", observation: "电源/信号链配套算力", status: "长期观察", relationTypes: ["产业链"], relations: [] },
  { code: "603501", name: "韦尔股份", market: "A股", position: "上游", sector: "端侧AI", positioning: "CIS 图像传感器龙头", observation: "端侧 AI 与手机复苏", status: "行情覆盖", relationTypes: ["主题关联"], relations: [] },
  { code: "688521", name: "芯原股份", market: "A股", position: "上游", sector: "EDA/IP", positioning: "国产芯片设计 IP 平台", observation: "Chiplet/IP 授权模式", status: "长期观察", relationTypes: ["产业链"], relations: ["ARM"] },
  { code: "301269", name: "华大九天", market: "A股", position: "上游", sector: "EDA/IP", positioning: "国产 EDA 龙头", observation: "EDA 自主可控稀缺标的", status: "行情覆盖", relationTypes: ["A股映射", "产业链"], relations: ["CDNS", "SNPS"] },
  { code: "603893", name: "瑞芯微", market: "A股", position: "上游", sector: "端侧AI", positioning: "端侧 AI SoC 龙头", observation: "AIoT 与边缘算力受益", status: "今日有新消息", relationTypes: ["主题关联"], relations: ["ARM"] },
  { code: "300496", name: "中科创达", market: "A股", position: "下游", sector: "端侧AI", positioning: "端侧 AI 软件+操作系统", observation: "大模型端侧落地", status: "行情覆盖", relationTypes: ["主题关联"], relations: [] },
  { code: "000063", name: "中兴通讯", market: "A股", position: "中游", sector: "交换机/网络", positioning: "通信设备+算力服务器", observation: "运营商算力投资受益", status: "行情覆盖", relationTypes: ["A股映射", "产业链"], relations: ["AVGO", "ANET"] },
  { code: "000938", name: "紫光股份", market: "A股", position: "中游", sector: "交换机/网络", positioning: "新华三,交换机+服务器", observation: "国产网络设备龙头", status: "行情覆盖", relationTypes: ["产业链"], relations: ["ANET"] },
  { code: "002475", name: "立讯精密", market: "A股", position: "中游", sector: "服务器/算力设备", positioning: "连接器+算力组件", observation: "高速铜连接受益", status: "行情覆盖", relationTypes: ["产业链"], relations: [] },
  { code: "002837", name: "英维克", market: "A股", position: "中游", sector: "液冷/温控", positioning: "数据中心液冷龙头", observation: "液冷渗透率提升核心受益", status: "今日有新消息", relationTypes: ["A股映射", "电力映射"], relations: ["VRT"] },
  { code: "002335", name: "科华数据", market: "A股", position: "中游", sector: "液冷/温控", positioning: "数据中心+储能温控", observation: "IDC 与电力配套双逻辑", status: "行情覆盖", relationTypes: ["电力映射"], relations: ["VRT"] },
  { code: "300499", name: "高澜股份", market: "A股", position: "中游", sector: "液冷/温控", positioning: "纯水冷却+液冷", observation: "算力散热弹性标的", status: "长期观察", relationTypes: ["电力映射"], relations: [] },
  { code: "002851", name: "麦格米特", market: "A股", position: "上游", sector: "电源/能源", positioning: "电源+电控平台", observation: "服务器电源受益算力", status: "行情覆盖", relationTypes: ["电力映射"], relations: [] },
  { code: "300870", name: "欧陆通", market: "A股", position: "上游", sector: "电源/能源", positioning: "服务器电源", observation: "高功率电源升级", status: "长期观察", relationTypes: ["电力映射"], relations: [] },
  { code: "601728", name: "中国电信", market: "A股", position: "下游", sector: "云计算/IDC", positioning: "运营商云+算力网络", observation: "国家算力投资主力", status: "行情覆盖", relationTypes: ["资本开支", "电力映射"], relations: [] },
  { code: "600050", name: "中国联通", market: "A股", position: "下游", sector: "云计算/IDC", positioning: "运营商云+IDC", observation: "算力网络建设受益", status: "长期观察", relationTypes: ["资本开支"], relations: [] },
  { code: "002230", name: "科大讯飞", market: "A股", position: "下游", sector: "大模型/应用", positioning: "国产大模型+语音 AI", observation: "星火大模型商业化", status: "今日有新消息", relationTypes: ["主题关联"], relations: ["PLTR"] },
  { code: "300033", name: "同花顺", market: "A股", position: "下游", sector: "大模型/应用", positioning: "金融 AI 应用", observation: "AI 投顾落地场景", status: "行情覆盖", relationTypes: ["主题关联"], relations: [] },
  { code: "688111", name: "金山办公", market: "A股", position: "下游", sector: "大模型/应用", positioning: "办公软件 AI 化", observation: "WPS AI 订阅变现", status: "行情覆盖", relationTypes: ["主题关联"], relations: ["MSFT"] },
  { code: "002747", name: "埃斯顿", market: "A股", position: "下游", sector: "机器人/具身", positioning: "国产工业机器人龙头", observation: "人形机器人主题映射", status: "行情覆盖", relationTypes: ["主题关联"], relations: ["TSLA"] },
  { code: "300124", name: "汇川技术", market: "A股", position: "下游", sector: "机器人/具身", positioning: "工控+机器人平台", observation: "具身智能核心零部件", status: "行情覆盖", relationTypes: ["主题关联"], relations: ["TSLA"] },
  { code: "002049", name: "紫光国微", market: "A股", position: "上游", sector: "AI芯片/GPU", positioning: "特种芯片+FPGA", observation: "国产可编程逻辑受益", status: "长期观察", relationTypes: ["产业链"], relations: [] },
  { code: "300782", name: "卓胜微", market: "A股", position: "上游", sector: "端侧AI", positioning: "射频前端龙头", observation: "端侧通信配套", status: "长期观察", relationTypes: ["主题关联"], relations: [] },
  { code: "002261", name: "拓维信息", market: "A股", position: "中游", sector: "服务器/算力设备", positioning: "华为昇腾生态算力", observation: "国产算力生态弹性", status: "今日有新消息", relationTypes: ["A股映射", "主题关联"], relations: ["NVDA"] },
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

// 转新浪行情代码:A股 sh/sz/bj 前缀,美股 gb_<ticker>
export function sinaSymbol(s: Pick<Stock, "code" | "market">): string {
  if (s.market === "美股") return `gb_${s.code.toLowerCase()}`;
  const c = s.code;
  if (c.startsWith("6") || c.startsWith("9")) return `sh${c}`;
  if (c.startsWith("4") || c.startsWith("8")) return `bj${c}`;
  return `sz${c}`;
}
