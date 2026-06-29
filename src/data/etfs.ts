// 板块 ETF:把 AI 产业链各主题映射到真实、有规模、流动性好的 A 股场内 ETF。
// 用户反馈想要"各板块的 ETF",但市场上 ETF 是按宽主题发的(没有"钽铌材料ETF"),
// 故把 57 个细分板块归并为 ~16 个可投主题,每个挑龙头 ETF。代码/规模经联网核验。
// ETF 不进个股的上下游/关联模型(它没有供应商/客户),单独成一份数据。

export interface Etf {
  code: string;
  name: string;
  exchange: "SH" | "SZ";
  theme: string; // 可投主题
  tracksIndex: string; // 跟踪指数
  scaleYi: number; // 规模(亿元,量级参考)
  covers: string[]; // 覆盖本站哪些板块/主题
  note: string; // 一句话备注(含同主题平替)
}

// 按主题大致从"硬科技核心 → 外围/资源"排序
export const ETFS: Etf[] = [
  {
    code: "159995",
    name: "芯片ETF",
    exchange: "SZ",
    theme: "半导体 / 芯片",
    tracksIndex: "国证半导体芯片指数",
    scaleYi: 260,
    covers: ["AI芯片/GPU", "CPU", "存储", "半导体设备", "代工/封测", "半导体材料", "先进封装", "EDA/IP"],
    note: "最大最活跃的芯片主题 ETF,综合覆盖半导体全链;沪市平替 512480 半导体ETF",
  },
  {
    code: "588200",
    name: "科创芯片ETF",
    exchange: "SH",
    theme: "科创芯片",
    tracksIndex: "上证科创板芯片指数",
    scaleYi: 450,
    covers: ["AI芯片/GPU", "半导体设备", "代工/封测", "先进封装", "EDA/IP"],
    note: "科创板芯片最大 ETF,20% 涨跌幅、弹性大",
  },
  {
    code: "159516",
    name: "半导体设备ETF",
    exchange: "SZ",
    theme: "半导体设备 / 材料",
    tracksIndex: "中证半导体材料设备主题指数",
    scaleYi: 190,
    covers: ["半导体设备", "半导体材料", "先进封装"],
    note: "设备+材料合并主题最大 ETF(A股无纯材料 ETF);沪市同指数 562590",
  },
  {
    code: "159819",
    name: "人工智能ETF",
    exchange: "SZ",
    theme: "人工智能 AI",
    tracksIndex: "中证人工智能主题指数",
    scaleYi: 221,
    covers: ["大模型/应用", "端侧AI", "AI芯片/GPU", "服务器/算力设备"],
    note: "全市场最大 AI 主题 ETF,流动性最好",
  },
  {
    code: "159363",
    name: "创业板人工智能ETF",
    exchange: "SZ",
    theme: "算力 / 数据中心",
    tracksIndex: "创业板人工智能指数",
    scaleYi: 79,
    covers: ["服务器/算力设备", "光模块/CPO", "云计算/IDC", "数据中心基础设施", "高速互联", "数据中心电力"],
    note: "约 70% 权重为算力(光模块+IDC),当前最佳算力/数据中心代理",
  },
  {
    code: "515880",
    name: "通信ETF",
    exchange: "SH",
    theme: "通信 / 光模块 / CPO",
    tracksIndex: "中证全指通信设备指数",
    scaleYi: 140,
    covers: ["光模块/CPO", "光子学与光通信", "交换机/网络", "高速互联"],
    note: "通信龙头 ETF,光模块权重约 46%;光模块纯度更高可选 159695 嘉实通信ETF",
  },
  {
    code: "516510",
    name: "云计算ETF",
    exchange: "SH",
    theme: "云计算 / 大数据",
    tracksIndex: "中证云计算与大数据主题指数",
    scaleYi: 23,
    covers: ["云计算/IDC", "数据中心基础设施", "云与软件", "数据存储"],
    note: "云计算主题最大 ETF;大数据敞口可补 515400 大数据ETF",
  },
  {
    code: "515230",
    name: "软件ETF",
    exchange: "SH",
    theme: "计算机 / 软件",
    tracksIndex: "中证全指软件指数",
    scaleYi: 60,
    covers: ["云与软件", "大模型/应用", "EDA/IP", "数据中心基础设施"],
    note: "软件主题最大 ETF;计算机口径平替 159998 计算机ETF",
  },
  {
    code: "562500",
    name: "机器人ETF",
    exchange: "SH",
    theme: "机器人 / 具身",
    tracksIndex: "中证机器人指数",
    scaleYi: 265,
    covers: ["机器人/具身", "端侧AI"],
    note: "规模最大、流动性断层领先;深市同指数 159770",
  },
  {
    code: "561600",
    name: "消费电子ETF",
    exchange: "SH",
    theme: "消费电子 / 端侧AI",
    tracksIndex: "中证消费电子主题指数",
    scaleYi: 48,
    covers: ["端侧AI", "PCB/载板", "存储"],
    note: "消费电子主题规模最大,对应端侧 AI 硬件与 PCB/元件",
  },
  {
    code: "159806",
    name: "新能源车ETF",
    exchange: "SZ",
    theme: "电动车 / 新能源车",
    tracksIndex: "中证新能源汽车指数",
    scaleYi: 90,
    covers: ["电动车", "电源/能源"],
    note: "新能源车主题规模最大;沪市最大同指数 515030",
  },
  {
    code: "159869",
    name: "游戏ETF",
    exchange: "SZ",
    theme: "传媒 / 游戏(AI应用)",
    tracksIndex: "中证动漫游戏指数",
    scaleYi: 52,
    covers: ["大模型/应用"],
    note: "游戏主题最大 ETF,对应 AI 内容/应用落地;更宽传媒口径 512980",
  },
  {
    code: "512660",
    name: "军工ETF",
    exchange: "SH",
    theme: "国防军工 / 航天",
    tracksIndex: "中证军工指数",
    scaleYi: 100,
    covers: ["国防军工", "太空与国防"],
    note: "军工主题规模最大、流动性最好;聚焦龙头可选 512710",
  },
  {
    code: "512400",
    name: "有色金属ETF",
    exchange: "SH",
    theme: "稀土 / 战略资源",
    tracksIndex: "中证申万有色金属指数",
    scaleYi: 335,
    covers: ["稀土资源与冶炼", "钨/钽/锗等战略资源", "能源"],
    note: "有色规模/流动性双第一,覆盖钨钽锗等战略金属;纯稀土敞口 516150",
  },
  {
    code: "159611",
    name: "电力ETF",
    exchange: "SZ",
    theme: "电力 / 数据中心电力",
    tracksIndex: "中证全指电力指数",
    scaleYi: 107,
    covers: ["数据中心电力", "能源", "电源/能源", "核能"],
    note: "电力主题规模最大;A股无独立核能 ETF,核电敞口经本指数间接覆盖",
  },
  {
    code: "588000",
    name: "科创50ETF",
    exchange: "SH",
    theme: "科创50(综合科技 beta)",
    tracksIndex: "上证科创板50成份指数",
    scaleYi: 931,
    covers: ["AI芯片/GPU", "半导体设备", "代工/封测", "服务器/算力设备", "大模型/应用"],
    note: "千亿级、流动性最好的综合硬科技 beta;中盘成长可补 588030 科创100ETF",
  },
];

export const ETF_CODES = ETFS.map((e) => e.code);
