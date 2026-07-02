// 美股历史日线(免费,Yahoo Finance chart API,无需 key)。用于历史相似性的"美股事件"侧。
// Tushare us_daily 需单独付费、东财封 Vercel IP,故美股历史走 Yahoo。失败返回空,调用方降级。
import { fetchJsonWithTimeout } from "@/lib/fetch-timeout";

type YahooChart = {
  chart?: {
    result?: Array<{
      timestamp?: number[];
      indicators?: { quote?: Array<{ close?: (number | null)[] }> };
    }>;
  };
};

export interface UsBar {
  date: string; // YYYY-MM-DD(美东)
  pct: number; // 当日涨跌 %
}

// 轻量探针:独立第三源(Yahoo,与新浪/腾讯不同基础设施)判"美股最近有数据的交易日"。
// 仅用于地板健康检查——主源(新浪+腾讯)双挂返回空时,区分"真休市/无异动"与"源故障"。
export async function usLatestTradingDay(ticker = "AAPL"): Promise<string | null> {
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(
    ticker
  )}?range=5d&interval=1d`;
  try {
    const j = await fetchJsonWithTimeout<YahooChart>(url, {
      headers: { "User-Agent": "Mozilla/5.0" },
      cache: "no-store",
    });
    const res = j?.chart?.result?.[0];
    const ts: number[] = res?.timestamp ?? [];
    const closes: (number | null)[] = res?.indicators?.quote?.[0]?.close ?? [];
    const fmt = new Intl.DateTimeFormat("en-CA", {
      timeZone: "America/New_York",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    });
    // 取有收盘价的最后一根 bar 的日期(美东)
    for (let i = ts.length - 1; i >= 0; i--) {
      if (closes[i] != null) return fmt.format(new Date(ts[i] * 1000));
    }
    return null;
  } catch {
    return null;
  }
}

// 美股最近一个交易日的涨跌%(用日线最后两根收盘算),多 ticker 并行。免鉴权、东京可达。
// 用途:隔夜美股大盘 context(纳指/标普/费半)——新浪封 Vercel 机房 IP、腾讯美股指数不全(无费半),故走 Yahoo。
export async function fetchYahooChanges(
  tickers: string[]
): Promise<Record<string, { change: number; asOf?: string }>> {
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const one = async (
    t: string
  ): Promise<[string, { change: number; asOf?: string }] | null> => {
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(
      t
    )}?range=5d&interval=1d`;
    try {
      const j = await fetchJsonWithTimeout<YahooChart>(
        url,
        { headers: { "User-Agent": "Mozilla/5.0" }, cache: "no-store" },
        6000
      );
      const res = j?.chart?.result?.[0];
      const ts = res?.timestamp ?? [];
      const closes = res?.indicators?.quote?.[0]?.close ?? [];
      const valid: { c: number; d: number }[] = [];
      for (let i = 0; i < ts.length; i++)
        if (closes[i] != null) valid.push({ c: closes[i] as number, d: ts[i] });
      if (valid.length < 2) return null;
      const last = valid[valid.length - 1];
      const prev = valid[valid.length - 2];
      if (prev.c === 0) return null;
      const change = Math.round(((last.c - prev.c) / prev.c) * 10000) / 100;
      return [t, { change, asOf: fmt.format(new Date(last.d * 1000)) }];
    } catch {
      return null;
    }
  };
  const results = await Promise.all(tickers.map(one));
  const out: Record<string, { change: number; asOf?: string }> = {};
  for (const r of results) if (r) out[r[0]] = r[1];
  return out;
}

export async function usDailyHistory(
  ticker: string,
  range = "2y"
): Promise<UsBar[]> {
  const url =
    `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(
      ticker
    )}?range=${range}&interval=1d`;
  try {
    const j = await fetchJsonWithTimeout<YahooChart>(url, {
      headers: { "User-Agent": "Mozilla/5.0" },
      cache: "no-store",
    });
    const res = j?.chart?.result?.[0];
    const ts: number[] = res?.timestamp ?? [];
    const closes: (number | null)[] = res?.indicators?.quote?.[0]?.close ?? [];
    const fmt = new Intl.DateTimeFormat("en-CA", {
      timeZone: "America/New_York",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    });
    const out: UsBar[] = [];
    for (let i = 1; i < ts.length; i++) {
      const c = closes[i];
      const p = closes[i - 1];
      if (c == null || p == null || p === 0) continue;
      out.push({
        date: fmt.format(new Date(ts[i] * 1000)),
        pct: Math.round(((c - p) / p) * 10000) / 100,
      });
    }
    return out;
  } catch {
    return [];
  }
}
