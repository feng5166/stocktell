// 美股历史日线(免费,Yahoo Finance chart API,无需 key)。用于历史相似性的"美股事件"侧。
// Tushare us_daily 需单独付费、东财封 Vercel IP,故美股历史走 Yahoo。失败返回空,调用方降级。
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
    const r = await fetch(url, {
      headers: { "User-Agent": "Mozilla/5.0" },
      cache: "no-store",
    });
    if (!r.ok) return null;
    const j = await r.json();
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

export async function usDailyHistory(
  ticker: string,
  range = "2y"
): Promise<UsBar[]> {
  const url =
    `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(
      ticker
    )}?range=${range}&interval=1d`;
  try {
    const r = await fetch(url, {
      headers: { "User-Agent": "Mozilla/5.0" },
      cache: "no-store",
    });
    if (!r.ok) return [];
    const j = await r.json();
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
