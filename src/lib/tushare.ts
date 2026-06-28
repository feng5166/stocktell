// Tushare Pro:A 股基本面(PE/PB/市值/换手率)。实时价仍走新浪(Tushare HTTP 无实时)。
// 需环境变量 TUSHARE_TOKEN(≥2000 积分才能用 daily_basic)。未配则返回 null。

export interface Fundamental {
  tradeDate: string; // YYYYMMDD
  peTtm: number | null; // 市盈率(TTM)
  pb: number | null; // 市净率
  totalMvYi: number | null; // 总市值(亿元)
  circMvYi: number | null; // 流通市值(亿元)
  turnover: number | null; // 换手率 %
}

// 裸代码 -> Tushare ts_code
export function tsCode(code: string): string | null {
  if (!/^\d{6}$/.test(code)) return null; // 仅 A 股 6 位数字
  if (code.startsWith("6") || code.startsWith("9")) return `${code}.SH`;
  if (code.startsWith("4") || code.startsWith("8")) return `${code}.BJ`;
  return `${code}.SZ`;
}

function n(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

async function tsCall(
  apiName: string,
  params: Record<string, string>,
  fields: string
) {
  const token = process.env.TUSHARE_TOKEN;
  if (!token) return null;
  const resp = await fetch("https://api.tushare.pro", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ api_name: apiName, token, params, fields }),
    cache: "no-store",
  });
  if (!resp.ok) return null;
  const data = (await resp.json()) as {
    code: number;
    data?: { fields: string[]; items: unknown[][] };
  };
  if (data.code !== 0 || !data.data) return null;
  return data.data;
}

// A 股交易日历缓存(进程内,按 YYYYMMDD,仅缓存权威结果)
const tradingDayCache = new Map<string, boolean>();

// 判断某天(YYYY-MM-DD)是否 A 股交易日(上交所日历,含节假日)。
// Tushare 未配/失败时回退:非周末即视为交易日(与旧行为一致,不致命退化)。
export async function isAshareTradingDay(dateISO: string): Promise<boolean> {
  const ymd = dateISO.replace(/-/g, "");
  const cached = tradingDayCache.get(ymd);
  if (cached !== undefined) return cached;

  const weekendFallback = () => {
    // dateISO 是北京日期;取当天 12:00+08(=04:00 UTC 同日)的 UTC 星期,稳妥不跨日
    const wd = new Date(`${dateISO}T12:00:00+08:00`).getUTCDay();
    return wd !== 0 && wd !== 6;
  };

  const d = await tsCall(
    "trade_cal",
    { exchange: "SSE", start_date: ymd, end_date: ymd },
    "cal_date,is_open"
  ).catch(() => null);

  if (!d || d.items.length === 0) return weekendFallback();
  const idx = d.fields.indexOf("is_open");
  const open = String(d.items[0][idx]) === "1";
  tradingDayCache.set(ymd, open);
  return open;
}

function ymdDaysAgo(days: number): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(Date.now() - days * 86400000));
  return parts.replace(/-/g, "");
}

// 取某只 A 股最近一个交易日的基本面
export async function fetchFundamental(code: string): Promise<Fundamental | null> {
  const ts = tsCode(code);
  if (!ts) return null;
  const d = await tsCall(
    "daily_basic",
    { ts_code: ts, start_date: ymdDaysAgo(20) },
    "ts_code,trade_date,pe_ttm,pb,total_mv,circ_mv,turnover_rate"
  );
  if (!d || d.items.length === 0) return null;
  const idx = (f: string) => d.fields.indexOf(f);
  // 取 trade_date 最大的一行
  const rows = [...d.items].sort((a, b) =>
    String(b[idx("trade_date")]).localeCompare(String(a[idx("trade_date")]))
  );
  const r = rows[0];
  const totalMv = n(r[idx("total_mv")]);
  const circMv = n(r[idx("circ_mv")]);
  return {
    tradeDate: String(r[idx("trade_date")]),
    peTtm: n(r[idx("pe_ttm")]),
    pb: n(r[idx("pb")]),
    totalMvYi: totalMv === null ? null : Math.round(totalMv / 10000) / 1, // 万元→亿元
    circMvYi: circMv === null ? null : Math.round(circMv / 10000) / 1,
    turnover: n(r[idx("turnover_rate")]),
  };
}
