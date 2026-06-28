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

// 上一个 A 股交易日(YYYY-MM-DD,严格早于 dateISO)。用于判断节后缺口/累计窗口。
// Tushare 不可用时回退:往前找第一个非周末日。
export async function prevAshareTradingDay(
  dateISO: string
): Promise<string | null> {
  const end = dateISO.replace(/-/g, "");
  const base = new Date(`${dateISO}T12:00:00+08:00`);
  base.setUTCDate(base.getUTCDate() - 30);
  const start = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  })
    .format(base)
    .replace(/-/g, "");

  const d = await tsCall(
    "trade_cal",
    { exchange: "SSE", start_date: start, end_date: end },
    "cal_date,is_open"
  ).catch(() => null);

  if (d && d.items.length) {
    const ci = d.fields.indexOf("cal_date");
    const oi = d.fields.indexOf("is_open");
    const openDays = d.items
      .filter((r) => String(r[oi]) === "1")
      .map((r) => String(r[ci]))
      .filter((x) => x < end)
      .sort();
    const prev = openDays.at(-1);
    if (prev) return `${prev.slice(0, 4)}-${prev.slice(4, 6)}-${prev.slice(6, 8)}`;
  }

  // 回退:往前找非周末
  for (let i = 1; i <= 7; i++) {
    const t = new Date(`${dateISO}T12:00:00+08:00`);
    t.setUTCDate(t.getUTCDate() - i);
    const iso = new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Shanghai",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(t);
    const wd = new Date(`${iso}T12:00:00+08:00`).getUTCDay();
    if (wd !== 0 && wd !== 6) return iso;
  }
  return null;
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

/* ---------- 资金面(P0:你的票·资金面)---------- */
// 都按"交易日全市场一次取 + 进程内按 ymd 缓存",调用方按自选过滤,省调用。

const mfCache = new Map<string, Map<string, number>>(); // ymd -> (裸code -> 主力净流入 亿元)
const lhCache = new Map<string, Map<string, LonghuHit>>(); // ymd -> (裸code -> 龙虎榜)

export interface LonghuHit {
  net: number; // 净买入额(亿元)
  reason: string;
}

// 某交易日全市场主力净流入(亿元)。net_mf_amount 单位万元 → /1e4 = 亿元。
export async function moneyflowByDate(ymd: string): Promise<Map<string, number>> {
  const hit = mfCache.get(ymd);
  if (hit) return hit;
  const out = new Map<string, number>();
  const d = await tsCall("moneyflow", { trade_date: ymd }, "ts_code,net_mf_amount");
  if (d) {
    const ci = d.fields.indexOf("ts_code");
    const ni = d.fields.indexOf("net_mf_amount");
    for (const r of d.items) {
      const code = String(r[ci]).split(".")[0];
      const v = n(r[ni]);
      if (v !== null) out.set(code, Math.round((v / 1e4) * 100) / 100);
    }
    mfCache.set(ymd, out); // 仅缓存成功结果
  }
  return out;
}

// 某交易日全市场龙虎榜(净买入额亿元 + 上榜原因)。net_amount 单位元 → /1e8 = 亿元。
export async function longhuByDate(ymd: string): Promise<Map<string, LonghuHit>> {
  const hit = lhCache.get(ymd);
  if (hit) return hit;
  const out = new Map<string, LonghuHit>();
  const d = await tsCall("top_list", { trade_date: ymd }, "ts_code,net_amount,reason");
  if (d) {
    const ci = d.fields.indexOf("ts_code");
    const ai = d.fields.indexOf("net_amount");
    const ri = d.fields.indexOf("reason");
    for (const r of d.items) {
      const code = String(r[ci]).split(".")[0];
      const net = (n(r[ai]) ?? 0) / 1e8;
      const reason = String(r[ri] ?? "").trim();
      const prev = out.get(code);
      // 同股多条:净额累加,原因取首条
      if (prev) prev.net = Math.round((prev.net + net) * 100) / 100;
      else out.set(code, { net: Math.round(net * 100) / 100, reason });
    }
    lhCache.set(ymd, out);
  }
  return out;
}

const mgCache = new Map<string, Map<string, number>>(); // ymd -> (裸code -> 融资余额 亿元)

// 某交易日全市场融资余额(亿元)。rzye 单位元 → /1e8 = 亿元。
export async function marginByDate(ymd: string): Promise<Map<string, number>> {
  const hit = mgCache.get(ymd);
  if (hit) return hit;
  const out = new Map<string, number>();
  const d = await tsCall("margin_detail", { trade_date: ymd }, "ts_code,rzye");
  if (d) {
    const ci = d.fields.indexOf("ts_code");
    const yi = d.fields.indexOf("rzye");
    for (const r of d.items) {
      const code = String(r[ci]).split(".")[0];
      const v = n(r[yi]);
      if (v !== null) out.set(code, Math.round((v / 1e8) * 100) / 100);
    }
    mgCache.set(ymd, out);
  }
  return out;
}

// 解析"最新有资金面数据的交易日"(ymd):优先今天(收盘后才有),否则上一交易日。
export async function latestFundYmd(todayISO: string): Promise<string | null> {
  const todayYmd = todayISO.replace(/-/g, "");
  if (await isAshareTradingDay(todayISO)) {
    const mf = await moneyflowByDate(todayYmd);
    if (mf.size > 0) return todayYmd;
  }
  const prev = await prevAshareTradingDay(todayISO);
  return prev ? prev.replace(/-/g, "") : null;
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
