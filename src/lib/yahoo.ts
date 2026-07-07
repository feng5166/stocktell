// 美股历史日线(免费,Yahoo Finance chart API,无需 key)。用于历史相似性的"美股事件"侧。
// Tushare us_daily 需单独付费、东财封 Vercel IP,故美股历史走 Yahoo。失败返回空,调用方降级。
// 缓修收敛(2026-07-07,四轮 review G2):chart API 的取数+解析此前在本文件手抄 4 份,
// 收敛为 fetchChartSeries 单一 core,四个导出全是薄变换——改解析/换端点只动一处。
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

const NY_FMT = new Intl.DateTimeFormat("en-CA", {
  timeZone: "America/New_York",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

// 单一 core:拉 chart 并解析成「有效收盘序列」(美东日期升序;剔 null/非正收盘)。
// 失败返回空数组,调用方各自降级。
async function fetchChartSeries(
  ticker: string,
  range: string,
  timeoutMs?: number
): Promise<{ date: string; close: number }[]> {
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(
    ticker
  )}?range=${range}&interval=1d`;
  try {
    const j = await fetchJsonWithTimeout<YahooChart>(
      url,
      { headers: { "User-Agent": "Mozilla/5.0" }, cache: "no-store" },
      timeoutMs
    );
    const res = j?.chart?.result?.[0];
    const ts: number[] = res?.timestamp ?? [];
    const closes: (number | null)[] = res?.indicators?.quote?.[0]?.close ?? [];
    const out: { date: string; close: number }[] = [];
    for (let i = 0; i < ts.length; i++) {
      const c = closes[i];
      if (c == null || c <= 0) continue;
      out.push({ date: NY_FMT.format(new Date(ts[i] * 1000)), close: c });
    }
    return out;
  } catch {
    return [];
  }
}

// 轻量探针:独立第三源(Yahoo,与新浪/腾讯不同基础设施)判"美股最近有数据的交易日"。
// 仅用于地板健康检查——主源(新浪+腾讯)双挂返回空时,区分"真休市/无异动"与"源故障"。
export async function usLatestTradingDay(ticker = "AAPL"): Promise<string | null> {
  const series = await fetchChartSeries(ticker, "5d");
  return series.length ? series[series.length - 1].date : null;
}

// 美股最近一个交易日的涨跌%(用日线最后两根收盘算),多 ticker 并行。免鉴权、东京可达。
// 用途:隔夜美股大盘 context(纳指/标普/费半)——新浪封 Vercel 机房 IP、腾讯美股指数不全(无费半),故走 Yahoo。
export async function fetchYahooChanges(
  tickers: string[]
): Promise<Record<string, { change: number; asOf?: string }>> {
  const one = async (
    t: string
  ): Promise<[string, { change: number; asOf?: string }] | null> => {
    const series = await fetchChartSeries(t, "5d", 6000);
    if (series.length < 2) return null;
    const last = series[series.length - 1];
    const prev = series[series.length - 2];
    const change = Math.round(((last.close - prev.close) / prev.close) * 10000) / 100;
    return [t, { change, asOf: last.date }];
  };
  const results = await Promise.all(tickers.map(one));
  const out: Record<string, { change: number; asOf?: string }> = {};
  for (const r of results) if (r) out[r[0]] = r[1];
  return out;
}

// 美股历史日收盘(pipeline-replay 回放行情源 fallback:东财限流/封机房 IP 时逐票回退这里)。
// 返回形状对齐 us-history.Bar({date, close},date 升序);仅 harness 消费,生产路径不走。
export async function usDailyCloses(
  ticker: string,
  range = "1y"
): Promise<{ date: string; close: number }[]> {
  return fetchChartSeries(ticker, range, 6000);
}

export async function usDailyHistory(
  ticker: string,
  range = "2y"
): Promise<UsBar[]> {
  const series = await fetchChartSeries(ticker, range);
  const out: UsBar[] = [];
  for (let i = 1; i < series.length; i++) {
    out.push({
      date: series[i].date,
      pct: Math.round(((series[i].close - series[i - 1].close) / series[i - 1].close) * 10000) / 100,
    });
  }
  return out;
}
