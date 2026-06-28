// 美股历史日 K(东方财富)。用于"节后首个 A 股交易日"计算假期累计涨跌。
// 端点轻量:secid=<市场>.<代码>,fields2=f51(日期),f53(收盘),lmt=最近 N 根。
const EM_MARKETS = [105, 106, 107]; // NASDAQ / NYSE / AMEX,逐个试

interface Bar {
  date: string; // YYYY-MM-DD
  close: number;
}

async function emCloses(ticker: string): Promise<Bar[] | null> {
  for (const mkt of EM_MARKETS) {
    try {
      const r = await fetch(
        `https://push2his.eastmoney.com/api/qt/stock/kline/get?secid=${mkt}.${ticker}&fields1=f1&fields2=f51,f53&klt=101&fqt=1&end=20500101&lmt=250`,
        { cache: "no-store", headers: { "User-Agent": "Mozilla/5.0" } }
      );
      if (!r.ok) continue;
      const j = (await r.json()) as { data?: { klines?: string[] } };
      const kl = j?.data?.klines;
      if (Array.isArray(kl) && kl.length) {
        const bars = kl
          .map((s) => {
            const [date, c] = s.split(",");
            return { date, close: parseFloat(c) };
          })
          .filter((b) => b.date && Number.isFinite(b.close) && b.close > 0);
        if (bars.length) return bars;
      }
    } catch {
      /* 试下一个市场 */
    }
  }
  return null;
}

export interface CumChange {
  change: number; // 累计涨跌 %
  fromDate: string; // 基准收盘所在交易日
  toDate: string; // 最新收盘所在交易日
  sessions: number; // 累计跨越的美股交易日数
}

// 从"baseExclusiveISO 之前最后一个交易日的收盘"到"最新收盘"的累计涨跌。
// baseExclusiveISO 传"上个 A 股交易日";正常情况(间隔1日)自然退化为最近一个 session 的涨跌。
export async function usCumulativeChange(
  ticker: string,
  baseExclusiveISO: string
): Promise<CumChange | null> {
  const bars = await emCloses(ticker);
  if (!bars || bars.length < 2) return null;
  const latest = bars[bars.length - 1];
  let baseIdx = -1;
  for (let i = bars.length - 1; i >= 0; i--) {
    if (bars[i].date < baseExclusiveISO) {
      baseIdx = i;
      break;
    }
  }
  if (baseIdx < 0) return null;
  const base = bars[baseIdx];
  if (base.date === latest.date) return null;
  return {
    change: Math.round((latest.close / base.close - 1) * 10000) / 100,
    fromDate: base.date,
    toDate: latest.date,
    sessions: bars.length - 1 - baseIdx,
  };
}
