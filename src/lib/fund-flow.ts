// 你的票·资金面:聚合某用户自选(A 股)的主力净流入 + 龙虎榜 + 融资余额变化。
// 共享给 /api/fund-flow(网页卡片)和 morning-brief(早报/邮件/微信),口径一致、各自缓存复用。
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

export async function fundFlowFor(codes: string[]): Promise<FundFlowResult> {
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
