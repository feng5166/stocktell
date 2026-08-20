// 个股资金形态:只用同一收盘日的价格、主力净额/成交比与当日龙虎榜
// 识别「形态特征」。这些标签不是对机构真实意图的确认,因此最高只给中置信;
// 证据不够必须返回「待判断」,不为填满表格而强行贴建仓/洗盘/出货标签。
import { unstable_cache } from "next/cache";
import { STOCKS, STOCK_MAP } from "@/data/stocks";
import { todayISO } from "@/lib/date";
import {
  dailyMarketByDate,
  latestFundYmd,
  longhuByDate,
  moneyflowByDate,
  type DailyMarketPoint,
  type LonghuHit,
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
  point: DayPoint | null;
  longhuNet: number | null;
};

const round = (value: number, digits = 2) => {
  const p = 10 ** digits;
  return Math.round(value * p) / p;
};
const signed = (value: number) => `${value > 0 ? "+" : ""}${value.toFixed(2)}%`;

export function classifyFundBehavior(input: BehaviorInput): FundBehaviorItem {
  const current = input.point;
  if (!current) {
    return {
      code: input.code,
      label: "待判断",
      confidence: "低",
      reason: "同一交易日的主力净额或成交额覆盖不足",
      flowRatio: null,
      pricePct: null,
    };
  }

  const longhuPositive = input.longhuNet != null && input.longhuNet > 0;
  const longhuNegative = input.longhuNet != null && input.longhuNet < 0;
  const longhuNote =
    input.longhuNet == null
      ? ""
      : `;当日龙虎榜净额 ${input.longhuNet > 0 ? "+" : ""}${input.longhuNet.toFixed(2)} 亿`;
  const base = {
    code: input.code,
    flowRatio: round(current.ratio),
    pricePct: round(current.pct),
  };

  // 当日价跌但资金明显流入:只称「洗盘特征」,不确认有人在洗盘。
  if (current.pct <= -0.8 && current.ratio >= 0.8) {
    return {
      ...base,
      label: "洗盘特征",
      confidence: longhuPositive || current.ratio >= 2 ? "中" : "低",
      reason: `当日股价 ${signed(current.pct)}、主力净额/成交比 ${signed(current.ratio)},出现价跌资流入分叉${longhuNote}`,
    };
  }

  // 当日资金强流入且价格同步向上:称「抢筹特征」。
  if (
    (current.ratio >= 3 && current.pct >= 0.5) ||
    (current.ratio >= 5 && current.pct >= 0) ||
    (current.ratio >= 2 && current.pct >= 3)
  ) {
    return {
      ...base,
      label: "抢筹特征",
      confidence: longhuPositive || current.ratio >= 5 ? "中" : "低",
      reason: `当日主力净额/成交比 ${signed(current.ratio)},股价 ${signed(current.pct)},资金与价格同步偏强${longhuNote}`,
    };
  }

  // 当日资金明显流出但价格仍相对坚挺:只描述「出货特征」,同步大跌不直接等于出货。
  if (current.ratio <= -1.5 && current.pct >= -0.5) {
    return {
      ...base,
      label: "出货特征",
      confidence: longhuNegative || current.ratio <= -3 ? "中" : "低",
      reason: `当日主力净额/成交比 ${signed(current.ratio)},股价 ${signed(current.pct)},呈现资金流出但价格相对坚挺的分叉${longhuNote}`,
    };
  }

  // 当日温和流入、价格没有明显追涨:称「建仓特征」,只描述当日形态。
  if (
    current.ratio >= 0.8 &&
    current.ratio < 3 &&
    current.pct >= -0.5 &&
    current.pct <= 2.5
  ) {
    return {
      ...base,
      label: "建仓特征",
      confidence: longhuPositive ? "中" : "低",
      reason: `当日主力净额/成交比 ${signed(current.ratio)},股价 ${signed(current.pct)},呈现温和流入且未明显追涨${longhuNote}`,
    };
  }

  // 不再使用历史窗口后,「衰竭」只表示当日价格与资金同时缺乏方向,不表达趋势见顶/见底。
  if (Math.abs(current.ratio) <= 0.25 && Math.abs(current.pct) <= 0.8) {
    return {
      ...base,
      label: "衰竭特征",
      confidence: "低",
      reason: `当日主力净额/成交比 ${signed(current.ratio)},股价 ${signed(current.pct)},价格与资金均缺乏明确方向${longhuNote}`,
    };
  }

  return {
    ...base,
    label: "待判断",
    confidence: "低",
    reason: "当日价格与资金方向尚未形成上述五类一致形态",
  };
}

const ymdToISO = (ymd: string) =>
  `${ymd.slice(0, 4)}-${ymd.slice(4, 6)}-${ymd.slice(6, 8)}`;

async function computeAllFundBehaviors(): Promise<FundBehaviorResult> {
  const latestYmd = await latestFundYmd(todayISO());
  if (!latestYmd) return { date: null, items: [] };
  const [currentMoneyflow, currentLonghu, currentMarket] = await Promise.all([
    moneyflowByDate(latestYmd).catch(() => new Map<string, number>()),
    longhuByDate(latestYmd).catch(() => new Map<string, LonghuHit>()),
    dailyMarketByDate(latestYmd).catch(
      () => new Map<string, DailyMarketPoint>()
    ),
  ]);
  const aCodes = STOCKS.filter((stock) => stock.market === "A股").map(
    (stock) => stock.code
  );

  const items = aCodes.map((code) => {
    const currentNetMf = currentMoneyflow.get(code);
    const market = currentMarket.get(code);
    const point =
      currentNetMf != null && market && market.amountYi > 0
        ? {
            ratio: (currentNetMf / market.amountYi) * 100,
            pct: market.pct,
          }
        : null;
    return classifyFundBehavior({
      code,
      point,
      longhuNet: currentLonghu.get(code)?.net ?? null,
    });
  });
  return { date: ymdToISO(latestYmd), items };
}

const cachedAllFundBehaviors = unstable_cache(
  computeAllFundBehaviors,
  ["fund-behavior-v2"],
  { revalidate: 1800 }
);

export async function fundBehaviorFor(codes: string[]): Promise<FundBehaviorResult> {
  const wanted = new Set(codes.filter((code) => STOCK_MAP[code]?.market === "A股"));
  if (!wanted.size) return { date: null, items: [] };
  const result = await cachedAllFundBehaviors();
  return { date: result.date, items: result.items.filter((item) => wanted.has(item.code)) };
}
