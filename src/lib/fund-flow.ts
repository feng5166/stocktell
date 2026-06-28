// 你的票·资金面:聚合某用户自选(A 股)的主力净流入 + 龙虎榜 + 融资余额变化。
// 共享给 /api/fund-flow(网页卡片)和 morning-brief(早报/邮件/微信),口径一致、各自缓存复用。
import { unstable_cache } from "next/cache";
import { STOCK_MAP } from "@/data/stocks";
import { todayISO } from "@/lib/date";
import {
  moneyflowByDate,
  longhuByDate,
  marginByDate,
  latestFundYmd,
  prevAshareTradingDay,
  type LonghuHit,
} from "@/lib/tushare";

export interface FundFlowItem {
  code: string;
  name: string;
  netMf: number | null; // 主力净流入(亿元)
  longhu: LonghuHit | null; // 龙虎榜净额/原因
  rzChgYi: number | null; // 融资余额较上一交易日变化(亿元)
}

export interface FundFlowResult {
  date: string | null; // 数据交易日 YYYY-MM-DD
  items: FundFlowItem[];
}

const ymdToISO = (ymd: string) =>
  `${ymd.slice(0, 4)}-${ymd.slice(4, 6)}-${ymd.slice(6, 8)}`;

async function computeFundFlow(codes: string[]): Promise<FundFlowResult> {
  const aCodes = codes.filter((c) => STOCK_MAP[c]?.market === "A股");
  if (aCodes.length === 0) return { date: null, items: [] };

  const ymd = await latestFundYmd(todayISO());
  if (!ymd) return { date: null, items: [] };

  const prevIso = await prevAshareTradingDay(ymdToISO(ymd));
  const prevYmd = prevIso ? prevIso.replace(/-/g, "") : null;

  const [mf, lh, mg, mgPrev] = await Promise.all([
    moneyflowByDate(ymd),
    longhuByDate(ymd),
    marginByDate(ymd),
    prevYmd ? marginByDate(prevYmd) : Promise.resolve(new Map<string, number>()),
  ]);

  const items: FundFlowItem[] = aCodes.map((code) => {
    const rz = mg.get(code);
    const rzPrev = mgPrev.get(code);
    const rzChgYi =
      rz !== undefined && rzPrev !== undefined
        ? Math.round((rz - rzPrev) * 100) / 100
        : null;
    return {
      code,
      name: STOCK_MAP[code].name,
      netMf: mf.get(code) ?? null,
      longhu: lh.get(code) ?? null,
      rzChgYi,
    };
  });

  return { date: ymdToISO(ymd), items };
}

// 按(去重排序后的)代码组合缓存 30 分钟。资金面是 T+1 日频数据,半小时足够新。
// 关键收益:morning-brief 内部与 /api/fund-flow 两个独立 serverless 调用共享同一份结果
// (Next Data Cache 跨实例持久),不再各打一遍 Tushare(moneyflow/top_list/margin)。
export async function fundFlowFor(codes: string[]): Promise<FundFlowResult> {
  const sorted = Array.from(
    new Set(codes.filter((c) => STOCK_MAP[c]?.market === "A股"))
  ).sort();
  if (sorted.length === 0) return { date: null, items: [] };
  return unstable_cache(() => computeFundFlow(sorted), ["fund-flow", sorted.join(",")], {
    revalidate: 1800,
  })();
}
