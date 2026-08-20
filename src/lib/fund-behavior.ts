// 个股资金形态:用同一收盘日的价格、主力净额/成交比、近 3 日连续性、融资与龙虎榜
// 识别「形态特征」。这些标签不是对机构真实意图的确认,因此最高只给中置信;
// 证据不够必须返回「待判断」,不为填满表格而强行贴建仓/洗盘/出货标签。
import { unstable_cache } from "next/cache";
import { STOCKS, STOCK_MAP } from "@/data/stocks";
import { todayISO } from "@/lib/date";
import { getFundBundle } from "@/lib/fund-flow";
import {
  dailyMarketByDate,
  latestFundYmd,
  prevAshareTradingDay,
  type DailyMarketPoint,
} from "@/lib/tushare";

export type FundBehaviorLabel =
  | "建仓特征"
  | "洗盘特征"
  | "抢筹特征"
  | "出货特征"
  | "衰竭特征"
  | "待判断";

export interface FundBehaviorItem {
  code: string;
  label: FundBehaviorLabel;
  confidence: "中" | "低";
  reason: string;
  flowRatio: number | null;
  pricePct: number | null;
  positiveDays: number;
  observedDays: number;
}

export interface FundBehaviorResult {
  date: string | null;
  items: FundBehaviorItem[];
}

type DayPoint = {
  ratio: number;
  pct: number;
};

type BehaviorInput = {
  code: string;
  points: DayPoint[]; // 新 → 旧,最多 3 日
  rzChgYi: number | null;
  longhuNet: number | null;
};

const round = (value: number, digits = 2) => {
  const p = 10 ** digits;
  return Math.round(value * p) / p;
};
const signed = (value: number) => `${value > 0 ? "+" : ""}${value.toFixed(2)}%`;

export function classifyFundBehavior(input: BehaviorInput): FundBehaviorItem {
  const current = input.points[0];
  if (!current) {
    return {
      code: input.code,
      label: "待判断",
      confidence: "低",
      reason: "同一交易日的主力净额或成交额覆盖不足",
      flowRatio: null,
      pricePct: null,
      positiveDays: 0,
      observedDays: 0,
    };
  }

  const ratios = input.points.map((point) => point.ratio);
  const positiveDays = ratios.filter((ratio) => ratio >= 0.5).length;
  const previous = ratios.slice(1);
  const previousPct = input.points.slice(1).reduce((sum, point) => sum + point.pct, 0);
  const recentPct = input.points.reduce((sum, point) => sum + point.pct, 0);
  const marginPositive = input.rzChgYi != null && input.rzChgYi >= 0.05;
  const longhuPositive = input.longhuNet != null && input.longhuNet > 0;
  const longhuNegative = input.longhuNet != null && input.longhuNet < 0;
  const base = {
    code: input.code,
    flowRatio: round(current.ratio),
    pricePct: round(current.pct),
    positiveDays,
    observedDays: input.points.length,
  };

  // 强流入且价格同步上行:先标「抢筹特征」,不把温和连续流入误归到这一档。
  if (
    (current.ratio >= 3 && current.pct >= 1) ||
    (current.ratio >= 2 && current.pct >= 3)
  ) {
    const supported = longhuPositive || marginPositive || previous.some((ratio) => ratio >= 0.5);
    return {
      ...base,
      label: "抢筹特征",
      confidence: supported ? "中" : "低",
      reason: `主力净额/成交比 ${signed(current.ratio)},股价 ${signed(current.pct)},资金与价格同步偏强`,
    };
  }

  // 价跌而资金为正是典型价资分叉,只能称「洗盘特征」,不能确认有人在洗盘。
  if (current.pct <= -1 && current.ratio >= 0.8) {
    const supported = marginPositive || previous.some((ratio) => ratio >= 0.5);
    return {
      ...base,
      label: "洗盘特征",
      confidence: supported ? "中" : "低",
      reason: `股价 ${signed(current.pct)}、主力净额/成交比 ${signed(current.ratio)},出现价跌资流入分叉`,
    };
  }

  // 近 3 日价格仍处高位区间、当日资金明显流出,才给「出货特征」;同步下跌不直接等于出货。
  if (
    current.ratio <= -2 &&
    recentPct >= 2 &&
    (current.pct >= -1 || previousPct >= 3)
  ) {
    return {
      ...base,
      label: "出货特征",
      confidence: longhuNegative || current.ratio <= -3 ? "中" : "低",
      reason: `近 ${input.points.length} 日累计涨跌 ${signed(recentPct)},当日主力净额/成交比 ${signed(current.ratio)},呈现高位流出形态`,
    };
  }

  // 前两日同向资金强度明显、当日缩至原来的四成以内:只描述资金动能衰减。
  if (previous.length === 2) {
    const samePositive = previous.every((ratio) => ratio >= 0.8);
    const sameNegative = previous.every((ratio) => ratio <= -0.8);
    const previousAbs = previous.reduce((sum, ratio) => sum + Math.abs(ratio), 0) / 2;
    const sameDirection =
      Math.abs(current.ratio) < 0.3 ||
      (samePositive && current.ratio > 0) ||
      (sameNegative && current.ratio < 0);
    if (
      (samePositive || sameNegative) &&
      previousAbs >= 1.2 &&
      sameDirection &&
      Math.abs(current.ratio) <= 1 &&
      Math.abs(current.ratio) <= previousAbs * 0.4
    ) {
      return {
        ...base,
        label: "衰竭特征",
        confidence: "低",
        reason: `此前连续同向的资金强度明显减弱,当日净额/成交比降至 ${signed(current.ratio)}`,
      };
    }
  }

  // 温和流入需要连续性或融资支持,避免把单日偶发净流入叫作建仓。
  if (
    current.ratio >= 0.7 &&
    positiveDays >= 2 &&
    current.pct >= -1.5 &&
    current.pct <= 3.5
  ) {
    return {
      ...base,
      label: "建仓特征",
      confidence: positiveDays === 3 || marginPositive ? "中" : "低",
      reason: `近 ${input.points.length} 日有 ${positiveDays} 日资金偏流入,当日净额/成交比 ${signed(current.ratio)},价格未出现急涨`,
    };
  }

  return {
    ...base,
    label: "待判断",
    confidence: "低",
    reason: "当前价格、资金方向与连续性尚未形成上述五类一致形态",
  };
}

const ymdToISO = (ymd: string) =>
  `${ymd.slice(0, 4)}-${ymd.slice(4, 6)}-${ymd.slice(6, 8)}`;

async function recentFundDates(latestYmd: string): Promise<string[]> {
  const dates = [latestYmd];
  let cursor = ymdToISO(latestYmd);
  for (let i = 0; i < 2; i++) {
    const previous = await prevAshareTradingDay(cursor);
    if (!previous) break;
    dates.push(previous.replace(/-/g, ""));
    cursor = previous;
  }
  return dates;
}

async function computeAllFundBehaviors(): Promise<FundBehaviorResult> {
  const latestYmd = await latestFundYmd(todayISO());
  if (!latestYmd) return { date: null, items: [] };
  const dates = await recentFundDates(latestYmd);
  const days = await Promise.all(
    dates.map(async (ymd) => {
      const [bundle, market] = await Promise.all([
        getFundBundle(ymd).catch(() => null),
        dailyMarketByDate(ymd).catch(() => new Map<string, DailyMarketPoint>()),
      ]);
      return { bundle, market };
    })
  );
  const currentBundle = days[0]?.bundle;
  const previousBundle = days[1]?.bundle;
  const aCodes = STOCKS.filter((stock) => stock.market === "A股").map((stock) => stock.code);

  const items = aCodes.map((code) => {
    const points: DayPoint[] = [];
    const currentDay = days[0];
    const currentNetMf = currentDay?.bundle?.mf[code];
    const currentMarket = currentDay?.market.get(code);
    // 最新资金日缺任一同日字段时不得拿上一交易日冒充当前日。
    if (currentNetMf != null && currentMarket && currentMarket.amountYi > 0) {
      points.push({
        ratio: (currentNetMf / currentMarket.amountYi) * 100,
        pct: currentMarket.pct,
      });
      for (const day of days.slice(1)) {
        const netMf = day.bundle?.mf[code];
        const market = day.market.get(code);
        if (netMf == null || !market || market.amountYi <= 0) continue;
        points.push({ ratio: (netMf / market.amountYi) * 100, pct: market.pct });
      }
    }
    const currentMargin = currentBundle?.mg[code];
    const previousMargin = previousBundle?.mg[code];
    const rzChgYi =
      currentMargin != null && previousMargin != null
        ? round(currentMargin - previousMargin)
        : null;
    return classifyFundBehavior({
      code,
      points,
      rzChgYi,
      longhuNet: currentBundle?.lh[code]?.net ?? null,
    });
  });
  return { date: ymdToISO(latestYmd), items };
}

const cachedAllFundBehaviors = unstable_cache(
  computeAllFundBehaviors,
  ["fund-behavior-v1"],
  { revalidate: 1800 }
);

export async function fundBehaviorFor(codes: string[]): Promise<FundBehaviorResult> {
  const wanted = new Set(codes.filter((code) => STOCK_MAP[code]?.market === "A股"));
  if (!wanted.size) return { date: null, items: [] };
  const result = await cachedAllFundBehaviors();
  return { date: result.date, items: result.items.filter((item) => wanted.has(item.code)) };
}
