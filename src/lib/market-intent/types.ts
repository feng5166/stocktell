// Market Intent Layer 类型(2.2.2,2026-08-13 负责人拍板)。
// 定位:回答「市场资金现在到底在干什么?这个行为和产业链逻辑是同向、背离,还是只是情绪交易?」
// 三条边界(负责人原话,不可越):
//   ① 只说「吸筹/洗盘/出货特征」,不声称识别了真实主力账户意图;
//   ② 只判断当下市场行为,不推导「所以下一步一定涨/跌」;
//   ③ Market Intent 绝不自动修改 relationType——资金与关系长期冲突走 reviewQueue 人工审查。
// 词汇拍板:意图词只在本结构化输出语境豁免(copylint-allow 逐行留痕),散文语境维持裸禁。

export type IntentType =
  | "accumulation" // 吸筹
  | "rush" // 抢筹
  | "wash" // 洗盘特征
  | "distribution" // 派发特征
  | "exit" // 出货特征
  | "divergence" // 分歧
  | "exhaustion" // 衰竭
  | "neutral"; // 中性

export type IntentConfidence = "high" | "medium" | "low";

// 展示铁律(负责人):结论 → 证据 → 反证 → 失效条件,缺一退化成盘口软件。
export interface MarketIntent {
  intent: IntentType;
  label: string; // 前台人话标签(洗盘/派发/出货 一律带「特征」后缀,不用确定句)
  confidence: IntentConfidence;
  evidence: string[]; // 支持证据(规则命中的条件,人话)
  counterEvidence: string[]; // 反证(与该意图相悖或缺失的信号,如实列)
  invalidation: string[]; // 失效条件(出现什么信号本判断作废)
}

// 板块单日输入指标(规则引擎唯一输入;fixture 存的就是这个结构 → 规则改动 CI 抓漂移)。
// 负责人红线:不能只用单日主力净流判断——3/5 日趋势、连续天数、20 日分位都是一等输入。
export interface SegmentDayMetrics {
  ymd: string; // 交易日 YYYYMMDD
  segment: string; // segment key(见 segments.ts)
  memberCount: number; // 参与聚合的 A 股成员数
  avgPct: number; // 等权平均涨跌 %
  upCount: number; // 上涨家数
  downCount: number; // 下跌家数
  breadth: number; // 上涨家数占比 0-1
  amountYi: number; // 板块总成交额(亿)
  amountPctl20: number | null; // 成交额 20 日分位 0-1(历史不足 10 日为 null)
  amountChgPct: number | null; // 成交额较上一交易日变化 %(无上日为 null)
  mainNetYi: number; // 主力净额(亿)
  mainStrength: number; // 主力强度 = 主力净额 / 成交额(成交额为 0 时为 0)
  retailNetYi: number | null; // 散户净额(亿,小单+中单;源缺失为 null)
  mainNet3dYi: number | null; // 近 3 日主力净额合计(含今日;历史不足为 null)
  mainNet5dYi: number | null; // 近 5 日主力净额合计(含今日;历史不足为 null)
  mainNetStreak: number; // 主力净额连续同向天数(+n 连续净流入 / -n 连续净流出,含今日)
  leaderCode: string | null; // 龙头代码(当日有数据的第一顺位)
  leaderPct: number | null; // 龙头当日涨跌 %
  leaderRelPct: number | null; // 龙头相对板块 = leaderPct - avgPct
  hasChainEvent: boolean; // 当日已发布简报是否命中本板块(触发源或映射标的)
  pos5dPct: number | null; // 近 5 日板块等权累计涨跌 %(含今日;不足为 null)
  pos10dPct: number | null;
  pos20dPct: number | null;
}

// 每日落库快照(store.ts):指标 + 判定一起存,Track/Timeline 回看「07-08 判断了什么,后来发生了什么」。
export interface SegmentIntentSnapshot {
  ymd: string;
  segment: string;
  metrics: SegmentDayMetrics;
  intent: MarketIntent;
}
