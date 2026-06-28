// P2 AI链情绪仪表盘:只看我们 AI 链股票池的整体情绪。
// A 股:Tushare 整日涨跌 + 主力净流入合计(EOD);隔夜美股:新浪实时我们的美股池。
// 进程内 TTL 缓存,避免每次页面加载都打数据源。
import { STOCKS } from "@/data/stocks";
import { todayISO } from "@/lib/date";
import { dailyByDate, moneyflowByDate, latestFundYmd } from "@/lib/tushare";
import { fetchQuotes } from "@/lib/quotes";

export interface ChainSentiment {
  date: string | null; // A 股数据交易日
  a: {
    up: number;
    down: number;
    flat: number;
    avgPct: number;
    netMfYi: number; // 主力净流入合计(亿元)
    covered: number;
  } | null;
  us: { up: number; down: number; avgPct: number; covered: number } | null;
}

let cache: { at: number; data: ChainSentiment } | null = null;
const TTL = 90_000; // 90s

export async function chainSentiment(): Promise<ChainSentiment> {
  if (cache && Date.now() - cache.at < TTL) return cache.data;

  const aCodes = STOCKS.filter((s) => s.market === "A股").map((s) => s.code);
  const usCodes = STOCKS.filter((s) => s.market === "美股").map((s) => s.code);

  // A 股(EOD)
  let a: ChainSentiment["a"] = null;
  let date: string | null = null;
  const ymd = await latestFundYmd(todayISO());
  if (ymd) {
    const [pctMap, mfMap] = await Promise.all([
      dailyByDate(ymd),
      moneyflowByDate(ymd),
    ]);
    const pcts = aCodes
      .map((c) => pctMap.get(c))
      .filter((v): v is number => v !== undefined);
    if (pcts.length) {
      const up = pcts.filter((v) => v > 0).length;
      const down = pcts.filter((v) => v < 0).length;
      const avg = pcts.reduce((s, v) => s + v, 0) / pcts.length;
      const netMf = aCodes
        .map((c) => mfMap.get(c))
        .filter((v): v is number => v !== undefined)
        .reduce((s, v) => s + v, 0);
      a = {
        up,
        down,
        flat: pcts.length - up - down,
        avgPct: Math.round(avg * 100) / 100,
        netMfYi: Math.round(netMf * 100) / 100,
        covered: pcts.length,
      };
      date = `${ymd.slice(0, 4)}-${ymd.slice(4, 6)}-${ymd.slice(6, 8)}`;
    }
  }

  // 隔夜美股(新浪实时,我们的美股池)
  let us: ChainSentiment["us"] = null;
  try {
    const { quotes } = await fetchQuotes(usCodes);
    const ch = usCodes
      .map((c) => quotes[c]?.change)
      .filter((v): v is number => v !== undefined && v !== null);
    if (ch.length) {
      const up = ch.filter((v) => v > 0).length;
      const down = ch.filter((v) => v < 0).length;
      const avg = ch.reduce((s, v) => s + v, 0) / ch.length;
      us = { up, down, avgPct: Math.round(avg * 100) / 100, covered: ch.length };
    }
  } catch {
    /* 美股拿不到就只给 A 股 */
  }

  const data: ChainSentiment = { date, a, us };
  cache = { at: Date.now(), data };
  return data;
}
