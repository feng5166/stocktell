// Market Intent 规则引擎(2.2.2 核心)。负责人拍板铁律:
//   规则引擎先判,LLM 不负责决定「是不是洗盘」——LLM 只把结果翻译成人话(2.2.3 再接,可选)。 // copylint-allow: Market Intent 结构化意图词,2026-08-13 拍板豁免(仅限本模块结构化输出语境)
// 纯函数、零 IO、确定性:同一份 SegmentDayMetrics 永远得到同一个判定 → fixture 可回放,
// 规则改动由 scripts/market-intent-check.ts 在 CI 抓分类漂移。
// 判定顺序(特异性从强到弱,先命中先得):出货 → 派发 → 抢筹 → 吸筹 → 洗盘 → 衰竭 → 分歧 → 中性。 // copylint-allow: 同上,意图枚举注释
// 表达纪律:洗盘/派发/出货 前台一律「××特征」,不用确定句;每个判定必须带 证据+反证+失效条件。 // copylint-allow: 同上
import type { IntentConfidence, IntentType, MarketIntent, SegmentDayMetrics } from "./types";

export const INTENT_LABEL: Record<IntentType, string> = {
  accumulation: "吸筹",
  rush: "抢筹",
  wash: "洗盘特征", // copylint-allow: Market Intent 意图标签(结构化输出语境豁免)
  distribution: "派发特征",
  exit: "出货特征",
  divergence: "分歧",
  exhaustion: "衰竭",
  neutral: "中性",
};

// 阈值单一来源(改这里 → 跑 npm run check:market-intent 看 fixture 是否漂移)。
// 校准依据:v1 为负责人规则描述的直译,数值取常识档;跑批 2-4 周后按快照复盘再调。
const TH = {
  acc: { streak: 3, maxAbsPct: 1.5, maxPos5: 5, amtLo: 0.35, amtHi: 0.85, hotBreadth: 0.8 },
  rush: { strength: 0.02, amtPctl: 0.8, pct: 2, breadth: 0.65 },
  // wash.pctHi=-0.5:「回落」必须是真回落——平盘/微涨日一律不判洗盘(fixture neutral-quiet-day 实证误判); // copylint-allow: 意图规则注释(结构化语境)
  // wash.prior5Min=1:前期流入要有量级(近5日合计≥1亿),零点几亿的噪声不构成「持续流入」前提。
  wash: { pctLo: -3.5, pctHi: -0.5, strengthFloor: -0.02, streakFloor: -2, prior5Min: 1 },
  dist: { pos10: 10, pos20: 12, amtPctl: 0.55, pctFloor: -2 },
  exit: { strength: -0.02, streak: -2, amtPctl: 0.6, pct: -1.5 },
  div: { minYi: 0.5, strongYi: 5, leaderGap: 2.5 },
  exh: { pct: 0.3, amtChg: -10, breadth: 0.5 },
};

const r1 = (v: number) => Math.round(v * 10) / 10;
const r2 = (v: number) => Math.round(v * 100) / 100;

type Verdict = { intent: IntentType; confidence: IntentConfidence; evidence: string[]; counterEvidence: string[]; invalidation: string[] } | null;

// ---- 各意图匹配器(每个都如实产出 证据/反证;反证=同方向上仍缺失或相悖的信号)----

function matchExit(m: SegmentDayMetrics): Verdict {
  // 出货:比派发更强的撤离——连续大幅流出 + 价格明显转弱 + 散户在承接;成交放大是 // copylint-allow: 意图规则注释(结构化语境)
  // 【软信号】不是硬门槛(20260813 真实样本:AI 应用 streak=-4/强度-9% 但 20 日分位仅 0.5,
  // 较昨日放大 35%——硬门槛会把典型撤离拦成中性)。分位高 → 可升 high;两者皆无 → 压 low。
  if (m.mainStrength > TH.exit.strength || m.mainNetStreak > TH.exit.streak) return null;
  if (m.avgPct > TH.exit.pct && (m.pos5dPct === null || m.pos5dPct > -5)) return null;
  const amtStrong = m.amountPctl20 !== null && m.amountPctl20 >= TH.exit.amtPctl;
  const amtExpanding = m.amountChgPct !== null && m.amountChgPct >= 15;
  const ev = [
    `主力资金连续 ${-m.mainNetStreak} 日净流出,当日净流出 ${r1(-m.mainNetYi)} 亿(占成交额 ${r2(-m.mainStrength * 100)}%)`,
    `板块价格明显转弱(当日 ${r1(m.avgPct)}%)`,
  ];
  const counter: string[] = [];
  let conf: IntentConfidence = "medium";
  if (amtStrong) ev.push(`成交处于 20 日高位(分位 ${r2(m.amountPctl20 as number)})`);
  else if (amtExpanding) {
    ev.push(`成交较上日放大 ${r1(m.amountChgPct as number)}%`);
    counter.push(`成交仅较昨日放大,20 日分位不高(${m.amountPctl20 ?? "无数据"})`);
  } else {
    counter.push("成交未见放大,撤离的量能特征不完整");
    conf = "low";
  }
  if (m.retailNetYi !== null && m.retailNetYi > 0) {
    ev.push(`散户资金净流入 ${r1(m.retailNetYi)} 亿,承接方以散户为主`);
    if (m.mainNetStreak <= -3 && amtStrong) conf = "high";
  } else counter.push("散户未见明显净流入,承接结构不典型");
  if (m.leaderPct !== null && m.leaderPct < 0) ev.push("龙头与板块同步走弱");
  else if (m.leaderPct !== null) counter.push(`龙头逆势(当日 ${r1(m.leaderPct)}%),与整体撤离不一致`);
  return {
    intent: "exit", confidence: conf, evidence: ev, counterEvidence: counter,
    invalidation: ["主力资金转为连续净流入", "价格与成交同步修复且散户净流出"],
  };
}

function matchDistribution(m: SegmentDayMetrics): Verdict {
  // 派发:前期已大涨 + 主力转流出 + 散户流入 + 成交高位 + 价格仍有韧性(筹码开始外转)。
  // 「前期大涨」看 10 日或 20 日任一窗口(20260813 真实样本:PCB 近 10 日 +31.9% 但
  // 20 日仅 +0.85%——只看 20 日会漏掉快速拉升后的高位换手)。
  const runup10 = m.pos10dPct !== null && m.pos10dPct >= TH.dist.pos10;
  const runup20 = m.pos20dPct !== null && m.pos20dPct >= TH.dist.pos20;
  if (!runup10 && !runup20) return null;
  if (m.mainNetYi >= 0 || (m.mainNet3dYi !== null && m.mainNet3dYi >= 0)) return null;
  if (m.amountPctl20 !== null && m.amountPctl20 < TH.dist.amtPctl) return null;
  if (m.avgPct < TH.dist.pctFloor) return null; // 已明显转弱的走 exit,不叫派发
  const ev = [
    runup10
      ? `近 10 日板块累计上行 ${r1(m.pos10dPct as number)}%,处于阶段高位`
      : `近 20 日板块累计上行 ${r1(m.pos20dPct as number)}%,处于阶段高位`,
    `主力资金转为净流出(当日 ${r1(-m.mainNetYi)} 亿${m.mainNet3dYi !== null ? `,近 3 日合计 ${r1(-m.mainNet3dYi)} 亿` : ""})`,
    `价格仍有韧性(当日 ${r1(m.avgPct)}%),筹码在高位换手`,
  ];
  const counter: string[] = [];
  let conf: IntentConfidence = "medium";
  if (m.retailNetYi !== null && m.retailNetYi > 0) {
    ev.push(`散户资金净流入 ${r1(m.retailNetYi)} 亿,与主力方向相反`);
    if (m.mainNetStreak <= -2) conf = "high";
  } else counter.push("散户未见明显净流入,派发结构不完整");
  if (m.amountPctl20 !== null) ev.push(`成交维持高位(20 日分位 ${r2(m.amountPctl20)})`);
  else counter.push("成交额历史分位数据不足");
  return {
    intent: "distribution", confidence: conf, evidence: ev, counterEvidence: counter,
    invalidation: ["主力资金重新转为连续净流入", "板块缩量后价格仍持稳且散户净流出"], // copylint-allow: 缩量为失效条件描述,产业判定语境(盘面搭配由 copy-lint 规则5管)
  };
}

function matchRush(m: SegmentDayMetrics): Verdict {
  // 抢筹:当日强净流入 + 成交显著放大 + 板块快速上涨 + 广度扩张 + 龙头同步。
  if (m.mainStrength < TH.rush.strength || m.avgPct < TH.rush.pct) return null;
  if (m.amountPctl20 !== null && m.amountPctl20 < TH.rush.amtPctl) return null;
  if (m.breadth < TH.rush.breadth) return null;
  const ev = [
    `主力资金当日净流入 ${r1(m.mainNetYi)} 亿(占成交额 ${r2(m.mainStrength * 100)}%)`,
    `板块快速上行(当日 ${r1(m.avgPct)}%),上涨家数占比 ${r2(m.breadth)}`,
  ];
  if (m.amountPctl20 !== null) ev.push(`成交显著放大(20 日分位 ${r2(m.amountPctl20)})`);
  const counter: string[] = [];
  let conf: IntentConfidence = "medium";
  const leaderSync = m.leaderPct !== null && m.leaderPct >= m.avgPct - 1;
  if (leaderSync) {
    ev.push("龙头与板块同步上行");
    if (m.amountPctl20 !== null && m.amountPctl20 >= 0.9) conf = "high";
  } else if (m.leaderPct !== null) counter.push(`龙头明显落后板块(${r1(m.leaderPct)}% vs ${r1(m.avgPct)}%),追逐集中在低位补涨`);
  if (m.hasChainEvent) ev.push("当日有链级事件触发,资金与事件同向");
  else counter.push("当日无链级事件,资金追逐缺少产业触发");
  return {
    intent: "rush", confidence: conf, evidence: ev, counterEvidence: counter,
    invalidation: ["次日起主力资金转净流出且价格滞涨", "上涨广度快速收缩至半数以下"],
  };
}

function matchAccumulation(m: SegmentDayMetrics): Verdict {
  // 吸筹:3-5 日持续净流入 + 价格未明显拉开 + 成交温和放大 + 散户可能流出 + 广度未过热。
  if (m.mainNetStreak < TH.acc.streak) return null;
  if (Math.abs(m.avgPct) > TH.acc.maxAbsPct) return null;
  if (m.pos5dPct !== null && m.pos5dPct > TH.acc.maxPos5) return null;
  if (m.breadth > TH.acc.hotBreadth) return null;
  if (m.amountPctl20 !== null && (m.amountPctl20 < TH.acc.amtLo || m.amountPctl20 > TH.acc.amtHi)) return null;
  const ev = [
    `主力资金连续 ${m.mainNetStreak} 日净流入${m.mainNet3dYi !== null ? `(近 3 日合计 ${r1(m.mainNet3dYi)} 亿)` : ""}`,
    `价格尚未明显拉开(当日 ${r1(m.avgPct)}%${m.pos5dPct !== null ? `,近 5 日累计 ${r1(m.pos5dPct)}%` : ""})`,
  ];
  if (m.amountPctl20 !== null) ev.push(`成交温和放大(20 日分位 ${r2(m.amountPctl20)}),未到情绪高热`);
  const counter: string[] = [];
  let conf: IntentConfidence = m.amountPctl20 === null ? "low" : "medium";
  if (m.retailNetYi !== null && m.retailNetYi < 0) {
    ev.push(`散户资金净流出 ${r1(-m.retailNetYi)} 亿,与主力方向相反`);
    if (m.mainNetStreak >= 4 && conf === "medium") conf = "high";
  } else counter.push("散户资金未见净流出,吸纳结构不典型");
  if (m.breadth > 0.6) counter.push(`板块广度已偏高(${r2(m.breadth)}),留意情绪升温`);
  else ev.push("板块广度未过热,不是全面情绪行情");
  return {
    intent: "accumulation", confidence: conf, evidence: ev, counterEvidence: counter,
    invalidation: ["后续连续两日主力大额净流出", "成交放大但价格转跌、散户转为净流入"],
  };
}

function matchWash(m: SegmentDayMetrics): Verdict {
  // 洗盘特征:价格回落/震荡 + 前期存在持续流入 + 资金结构没有同步恶化 + 散户流出较明显。 // copylint-allow: Market Intent 意图规则注释(结构化语境豁免)
  if (m.avgPct < TH.wash.pctLo || m.avgPct > TH.wash.pctHi) return null;
  if (m.mainNet5dYi === null || m.mainNet5dYi < TH.wash.prior5Min) return null; // 前期持续流入是前提(要有量级)
  if (m.mainStrength < TH.wash.strengthFloor) return null; // 今日主力大幅流出的不叫洗盘 // copylint-allow: 同上
  if (m.mainNetStreak <= TH.wash.streakFloor) return null; // 连续流出的更接近撤离
  const ev = [
    `价格承压(当日 ${r1(m.avgPct)}%),但近 5 日主力净额仍为正(合计 ${r1(m.mainNet5dYi)} 亿)`,
    `当日主力未见大幅流出(强度 ${r2(m.mainStrength * 100)}%),资金结构没有同步转坏`,
  ];
  const counter: string[] = [];
  const conf: IntentConfidence = "medium"; // 洗盘判定天然不确定,上限中等置信度(负责人拍板用「特征」口径) // copylint-allow: 同上
  if (m.retailNetYi !== null && m.retailNetYi < 0) ev.push(`散户资金净流出 ${r1(-m.retailNetYi)} 亿,回落中先离场的是散户`);
  else counter.push("散户未见明显流出,洗盘结构不典型"); // copylint-allow: 同上
  if (m.hasChainEvent) counter.push("当日有链级事件,价格波动可能是事件驱动而非资金行为");
  return {
    intent: "wash", confidence: conf, evidence: ev, counterEvidence: counter,
    invalidation: ["主力转为连续两日以上净流出", "价格继续下行且散户转为净流入"],
  };
}

function matchExhaustion(m: SegmentDayMetrics): Verdict {
  // 衰竭:价格还在涨,但主力流入退坡 + 成交下降 + 上涨广度收缩。
  if (m.avgPct < TH.exh.pct) return null;
  const mainFading =
    m.mainNetYi < 0 ||
    (m.mainNet3dYi !== null && m.mainNet3dYi > 0 && m.mainNetYi < (m.mainNet3dYi / 3) * 0.5);
  if (!mainFading) return null;
  const amtFading = m.amountChgPct !== null && m.amountChgPct <= TH.exh.amtChg;
  const breadthNarrow = m.breadth < TH.exh.breadth;
  if (!amtFading && !breadthNarrow) return null;
  const ev = [`价格仍在上行(当日 ${r1(m.avgPct)}%),但主力净额退坡(当日 ${r1(m.mainNetYi)} 亿)`];
  if (amtFading) ev.push(`成交额较上日收缩 ${r1(-(m.amountChgPct as number))}%`);
  if (breadthNarrow) ev.push(`上涨广度收缩(占比 ${r2(m.breadth)}),上行集中在少数标的`);
  const counter: string[] = [];
  if (!amtFading) counter.push("成交额尚未明显收缩");
  if (!breadthNarrow) counter.push("上涨广度尚未收缩");
  return {
    intent: "exhaustion", confidence: amtFading && breadthNarrow ? "medium" : "low",
    evidence: ev, counterEvidence: counter,
    invalidation: ["主力净流入与成交额重新同步放大", "上涨广度重新扩张"],
  };
}

function matchDivergence(m: SegmentDayMetrics): Verdict {
  // 分歧:主力/散户反向、龙头与板块不一致、广度与涨跌背离——三征命中其二。
  const signals: string[] = [];
  const counter: string[] = [];
  const mainRetailOpposite =
    m.retailNetYi !== null &&
    Math.abs(m.mainNetYi) >= TH.div.minYi &&
    Math.abs(m.retailNetYi) >= TH.div.minYi &&
    m.mainNetYi * m.retailNetYi < 0;
  if (mainRetailOpposite)
    signals.push(`主力(${r1(m.mainNetYi)} 亿)与散户(${r1(m.retailNetYi as number)} 亿)方向相反`);
  const leaderSplit =
    m.leaderPct !== null && m.leaderRelPct !== null && Math.abs(m.leaderRelPct) >= TH.div.leaderGap;
  if (leaderSplit)
    signals.push(`龙头(${r1(m.leaderPct as number)}%)与板块(${r1(m.avgPct)}%)明显不一致`);
  const breadthSplit =
    (m.avgPct > 0.3 && m.breadth < 0.45) || (m.avgPct < -0.3 && m.breadth > 0.55);
  if (breadthSplit)
    signals.push(`板块涨跌(${r1(m.avgPct)}%)与上涨家数占比(${r2(m.breadth)})背离`);
  // 主散双向都是大额(各≥strongYi)的对撞,单征即够格——20260813 PCB 主力 -30.8 亿/
  // 散户 +29.4 亿被「三征取二」拦成中性,是规则过严不是市场没分歧。
  const strongOpposite =
    mainRetailOpposite &&
    Math.abs(m.mainNetYi) >= TH.div.strongYi &&
    Math.abs(m.retailNetYi as number) >= TH.div.strongYi;
  if (signals.length < 2 && !strongOpposite) return null;
  if (!mainRetailOpposite) counter.push("主力与散户方向尚一致");
  if (!leaderSplit) counter.push("龙头与板块方向尚一致");
  if (!breadthSplit) counter.push("广度与指数表现尚一致");
  return {
    intent: "divergence", confidence: "medium", evidence: signals, counterEvidence: counter,
    invalidation: ["主力/散户、龙头/板块、广度三组信号重新同向"],
  };
}

// ---- 主入口:按特异性顺序匹配,先命中先得;全不命中 = 中性(不强行判断)----
export function classifyIntent(m: SegmentDayMetrics): MarketIntent {
  const matchers = [matchExit, matchDistribution, matchRush, matchAccumulation, matchWash, matchExhaustion, matchDivergence];
  for (const fn of matchers) {
    const v = fn(m);
    if (v) return { ...v, label: INTENT_LABEL[v.intent] };
  }
  const noHistory = m.mainNet3dYi === null || m.amountPctl20 === null;
  return {
    intent: "neutral",
    label: INTENT_LABEL.neutral,
    confidence: "low",
    evidence: [
      `当日主力净额 ${r1(m.mainNetYi)} 亿、板块 ${r1(m.avgPct)}%,未形成足够特征`,
    ],
    counterEvidence: noHistory ? ["历史数据积累不足,趋势类信号暂不可判"] : [],
    invalidation: [],
  };
}
