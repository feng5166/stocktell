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
  capDates(tradingDayCache, 500); // 交易日判定很小,留宽松上限即可
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

// 进程内按 ymd 缓存全市场数据:长生命周期实例下会按访问过的日期累积。给个 FIFO 上限裁剪,
// 防止内存缓慢膨胀(资金面只用最近 1-2 个交易日,日级缓存留 10 天足够)。
const CACHE_MAX_DATES = 10;
function capDates<V>(m: Map<string, V>, max = CACHE_MAX_DATES) {
  while (m.size > max) {
    const oldest = m.keys().next().value as string | undefined;
    if (oldest === undefined) break;
    m.delete(oldest);
  }
}

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
    capDates(mfCache);
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
    capDates(lhCache);
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
    capDates(mgCache);
  }
  return out;
}

const dCache = new Map<string, Map<string, number>>(); // ymd -> (裸code -> 当日涨跌%)

// 某交易日全市场日线涨跌幅(pct_chg %)。用于情绪仪表盘(整日涨跌家数/均幅)。
export async function dailyByDate(ymd: string): Promise<Map<string, number>> {
  const hit = dCache.get(ymd);
  if (hit) return hit;
  const out = new Map<string, number>();
  const d = await tsCall("daily", { trade_date: ymd }, "ts_code,pct_chg");
  if (d) {
    const ci = d.fields.indexOf("ts_code");
    const pi = d.fields.indexOf("pct_chg");
    for (const r of d.items) {
      const code = String(r[ci]).split(".")[0];
      const v = n(r[pi]);
      if (v !== null) out.set(code, v);
    }
    dCache.set(ymd, out);
    capDates(dCache);
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

// A 股日线历史(date YYYY-MM-DD, pct 当日涨跌%),按日期升序。用于历史相似性统计。
export async function dailyHistory(
  code: string,
  startYmd: string
): Promise<{ date: string; pct: number }[]> {
  const ts = tsCode(code);
  if (!ts) return [];
  const d = await tsCall(
    "daily",
    { ts_code: ts, start_date: startYmd },
    "trade_date,pct_chg"
  );
  if (!d) return [];
  const ci = d.fields.indexOf("trade_date");
  const pi = d.fields.indexOf("pct_chg");
  return d.items
    .map((r) => {
      const ymd = String(r[ci]);
      const pct = n(r[pi]);
      return {
        date: `${ymd.slice(0, 4)}-${ymd.slice(4, 6)}-${ymd.slice(6, 8)}`,
        pct: pct ?? 0,
      };
    })
    .filter((x) => /^\d{4}-\d{2}-\d{2}$/.test(x.date))
    .sort((a, b) => a.date.localeCompare(b.date));
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

// ===== 雷区雷达:按 ts_code 的原始拉取(阈值/格式化在 risk-radar.ts)=====
// 调用方按自选小集合逐只调用,结果在 risk-radar 用 unstable_cache 按天缓存。

export interface FloatRow {
  floatDate: string; // YYYYMMDD 解禁日
  floatRatio: number | null; // 占比(%)
  holder: string;
  shareType: string; // 定增股份 / 首发原股东限售 / 股权激励限售 等
}
export async function shareFloatRows(code: string): Promise<FloatRow[]> {
  const ts = tsCode(code);
  if (!ts) return [];
  const d = await tsCall(
    "share_float",
    { ts_code: ts },
    "float_date,float_ratio,holder_name,share_type"
  ).catch(() => null);
  if (!d) return [];
  const i = (k: string) => d.fields.indexOf(k);
  return d.items
    .map((r) => ({
      floatDate: String(r[i("float_date")] ?? ""),
      floatRatio: n(r[i("float_ratio")]),
      holder: String(r[i("holder_name")] ?? ""),
      shareType: String(r[i("share_type")] ?? ""),
    }))
    .filter((x) => /^\d{8}$/.test(x.floatDate));
}

export interface HolderTradeRow {
  annDate: string; // YYYYMMDD 公告日
  holder: string;
  holderType: string; // G高管 P个人 C公司
  inDe: string; // IN增持 DE减持
  changeRatio: number | null; // 占流通比(%)
  avgPrice: number | null;
}
export async function holderTradeRows(code: string): Promise<HolderTradeRow[]> {
  const ts = tsCode(code);
  if (!ts) return [];
  const d = await tsCall(
    "stk_holdertrade",
    { ts_code: ts },
    "ann_date,holder_name,holder_type,in_de,change_ratio,avg_price"
  ).catch(() => null);
  if (!d) return [];
  const i = (k: string) => d.fields.indexOf(k);
  return d.items
    .map((r) => ({
      annDate: String(r[i("ann_date")] ?? ""),
      holder: String(r[i("holder_name")] ?? ""),
      holderType: String(r[i("holder_type")] ?? ""),
      inDe: String(r[i("in_de")] ?? ""),
      changeRatio: n(r[i("change_ratio")]),
      avgPrice: n(r[i("avg_price")]),
    }))
    .filter((x) => /^\d{8}$/.test(x.annDate));
}

// 最新一期股权质押比例(%)。无数据返回 null。
export async function pledgeRatioLatest(code: string): Promise<number | null> {
  const ts = tsCode(code);
  if (!ts) return null;
  const d = await tsCall("pledge_stat", { ts_code: ts }, "end_date,pledge_ratio").catch(
    () => null
  );
  if (!d || d.items.length === 0) return null;
  const di = d.fields.indexOf("end_date");
  const pi = d.fields.indexOf("pledge_ratio");
  const latest = [...d.items].sort((a, b) =>
    String(b[di]).localeCompare(String(a[di]))
  )[0];
  return n(latest[pi]);
}

export interface RepurchaseRow {
  annDate: string;
  proc: string; // 进度:董事会预案/股东大会通过/实施/完成
  amountYi: number | null; // 回购金额(亿元)
}
export async function repurchaseRows(code: string): Promise<RepurchaseRow[]> {
  const ts = tsCode(code);
  if (!ts) return [];
  const d = await tsCall("repurchase", { ts_code: ts }, "ann_date,proc,amount").catch(
    () => null
  );
  if (!d) return [];
  const i = (k: string) => d.fields.indexOf(k);
  return d.items
    .map((r) => {
      const amt = n(r[i("amount")]);
      return {
        annDate: String(r[i("ann_date")] ?? ""),
        proc: String(r[i("proc")] ?? ""),
        amountYi: amt === null ? null : Math.round((amt / 1e8) * 100) / 100,
      };
    })
    .filter((x) => /^\d{8}$/.test(x.annDate));
}

// 当前股票名(用于 ST 判定):namechange 里 end_date 为空的那条 = 现用名。
export async function currentName(code: string): Promise<string | null> {
  const ts = tsCode(code);
  if (!ts) return null;
  const d = await tsCall("namechange", { ts_code: ts }, "name,start_date,end_date").catch(
    () => null
  );
  if (!d || d.items.length === 0) return null;
  const ni = d.fields.indexOf("name");
  const ei = d.fields.indexOf("end_date");
  const si = d.fields.indexOf("start_date");
  const cur = d.items.find((r) => !r[ei]); // end_date 空 = 现用名
  if (cur) return String(cur[ni] ?? "");
  // 兜底:取 start_date 最新的一条
  const latest = [...d.items].sort((a, b) =>
    String(b[si]).localeCompare(String(a[si]))
  )[0];
  return latest ? String(latest[ni] ?? "") : null;
}

// ===== 财报体检卡:最新年报三大报表 + 财务指标(financials.ts 做规则/人话)=====
export interface AnnualFinancials {
  period: string; // YYYYMMDD(年报)
  revenue: number | null; // 营业收入(元)
  niAttr: number | null; // 归母净利润(元)
  ocf: number | null; // 经营活动现金流净额(元)
  equity: number | null; // 归母净资产(元)
  goodwill: number | null; // 商誉(元)
  cash: number | null; // 货币资金(元)
  stDebt: number | null; // 短期有息负债 ≈ 短期借款 + 一年内到期非流动负债(元)
  roe: number | null; // %
  gross: number | null; // 毛利率 %
  dedt: number | null; // 扣非净利润(元)
}

// 取某 api 的最新一期行(end_date 最大者,季报/年报都算——要的就是"最新")
function latestRow(d: { fields: string[]; items: unknown[][] } | null) {
  if (!d || !d.items.length) return null;
  const ei = d.fields.indexOf("end_date");
  return [...d.items].sort((a, b) => String(b[ei]).localeCompare(String(a[ei])))[0] ?? null;
}

export async function latestFinancials(code: string): Promise<AnnualFinancials | null> {
  const ts = tsCode(code);
  if (!ts) return null;
  const [inc, bs, cf, fi] = await Promise.all([
    tsCall("income", { ts_code: ts }, "end_date,revenue,n_income_attr_p").catch(() => null),
    tsCall(
      "balancesheet",
      { ts_code: ts },
      "end_date,total_hldr_eqy_exc_min_int,goodwill,money_cap,st_borr,non_cur_liab_due_1y"
    ).catch(() => null),
    tsCall("cashflow", { ts_code: ts }, "end_date,n_cashflow_act").catch(() => null),
    tsCall("fina_indicator", { ts_code: ts }, "end_date,roe,grossprofit_margin,profit_dedt").catch(
      () => null
    ),
  ]);
  const ri = latestRow(inc);
  if (!ri) return null;
  const pick = (
    row: unknown[] | null,
    d: { fields: string[] } | null,
    key: string
  ): number | null => (row && d ? n(row[d.fields.indexOf(key)]) : null);

  const rb = latestRow(bs);
  const rc = latestRow(cf);
  const rf = latestRow(fi);
  const period = String(ri[inc!.fields.indexOf("end_date")]);
  const st = pick(rb, bs, "st_borr");
  const due1y = pick(rb, bs, "non_cur_liab_due_1y");
  const stDebt = st === null && due1y === null ? null : (st ?? 0) + (due1y ?? 0);

  return {
    period,
    revenue: pick(ri, inc, "revenue"),
    niAttr: pick(ri, inc, "n_income_attr_p"),
    ocf: pick(rc, cf, "n_cashflow_act"),
    equity: pick(rb, bs, "total_hldr_eqy_exc_min_int"),
    goodwill: pick(rb, bs, "goodwill"),
    cash: pick(rb, bs, "money_cap"),
    stDebt,
    roe: pick(rf, fi, "roe"),
    gross: pick(rf, fi, "grossprofit_margin"),
    dedt: pick(rf, fi, "profit_dedt"),
  };
}

// 业绩预告(最新一条,按公告日):预增/预减/扭亏 + 净利变动区间 %
export interface ForecastInfo {
  period: string; // 报告期 YYYYMMDD
  type: string; // 预增/预减/扭亏/略增...
  pctMin: number | null;
  pctMax: number | null;
  summary: string | null;
}
export async function latestForecast(code: string): Promise<ForecastInfo | null> {
  const ts = tsCode(code);
  if (!ts) return null;
  const d = await tsCall(
    "forecast",
    { ts_code: ts },
    "end_date,ann_date,type,p_change_min,p_change_max,summary"
  ).catch(() => null);
  if (!d || !d.items.length) return null;
  const ai = d.fields.indexOf("ann_date");
  const row = [...d.items].sort((a, b) => String(b[ai]).localeCompare(String(a[ai])))[0];
  const get = (k: string) => row[d.fields.indexOf(k)];
  return {
    period: String(get("end_date")),
    type: String(get("type") ?? ""),
    pctMin: n(get("p_change_min")),
    pctMax: n(get("p_change_max")),
    summary: get("summary") ? String(get("summary")) : null,
  };
}

// 下次财报预约披露:取尚未实际披露(actual_date 空)、预约日 >= 今天 的最近一条
export interface DisclosurePlan {
  period: string; // 报告期 YYYYMMDD
  preDate: string; // 预约披露日 YYYYMMDD
}
export async function nextDisclosure(code: string): Promise<DisclosurePlan | null> {
  const ts = tsCode(code);
  if (!ts) return null;
  const d = await tsCall(
    "disclosure_date",
    { ts_code: ts },
    "end_date,pre_date,actual_date"
  ).catch(() => null);
  if (!d || !d.items.length) return null;
  const ei = d.fields.indexOf("end_date");
  const pi = d.fields.indexOf("pre_date");
  const ai = d.fields.indexOf("actual_date");
  const nowYmd = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Shanghai" })
    .format(new Date())
    .replace(/-/g, "");
  const upcoming = d.items
    .filter((r) => !r[ai] && String(r[pi] ?? "") >= nowYmd)
    .sort((a, b) => String(a[pi]).localeCompare(String(b[pi])))[0];
  if (!upcoming) return null;
  return { period: String(upcoming[ei]), preDate: String(upcoming[pi]) };
}
