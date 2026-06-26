// 历史日K(回测用):东方财富 push2his,A股/美股同一接口,单标的一请求。
// 字段:f51=日期, f53=收盘, f59=当日涨跌幅%。被限频/失败时返回空,调用方按"覆盖不足"处理,绝不编数据。
export interface DailyBar {
  date: string; // YYYY-MM-DD
  close: number;
  change: number; // 当日涨跌幅 %
}

// 我们映射池里在纽交所(106)上市的美股;其余默认纳斯达克(105)。
// 猜错的标的会拉到空,被当作"未覆盖"跳过,不影响正确性。
const US_NYSE = new Set([
  "TSM", "ORCL", "ANET", "DELL", "VRT", "COHR", "GLW", "CIEN", "IPGP",
  "AES", "ETN", "RTX", "LMT", "CVX", "LNG", "GEV", "BE", "FLNC", "CLS",
  "PL", "NOW", "SNOW", "LI", "XPEV", "CRCL",
]);

export function emSecid(code: string, market: "美股" | "A股"): string {
  if (market === "美股") return `${US_NYSE.has(code) ? 106 : 105}.${code}`;
  // A股:6 开头沪市=1(含 688),其余(0/3/002/300/920…)=0
  return `${code.startsWith("6") ? 1 : 0}.${code}`;
}

export async function fetchDailyBars(secid: string, lmt = 40): Promise<DailyBar[]> {
  const url =
    `https://push2his.eastmoney.com/api/qt/stock/kline/get?secid=${secid}` +
    `&fields1=f1&fields2=f51,f53,f59&klt=101&fqt=1&end=20500101&lmt=${lmt}`;
  try {
    const r = await fetch(url, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
        Referer: "https://quote.eastmoney.com/",
      },
      cache: "no-store",
    });
    if (!r.ok) return [];
    const j = await r.json();
    const klines: string[] = j?.data?.klines ?? [];
    return klines
      .map((k) => {
        const [date, close, change] = k.split(",");
        return { date, close: parseFloat(close), change: parseFloat(change) };
      })
      .filter(
        (b) => b.date && Number.isFinite(b.close) && Number.isFinite(b.change)
      );
  } catch {
    return [];
  }
}
