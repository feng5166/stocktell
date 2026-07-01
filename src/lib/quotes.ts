// 行情抓取:主源腾讯(qt.gtimg.cn),缺失时回落新浪(hq.sinajs.cn),消除单点。
// (原主源新浪,但 Vercel 机房 IP 被新浪 403 封、慢速拒绝拖 5s,故换腾讯优先。)
// 两源都 GBK 解码。后续要换 Polygon.io / AKShare,只改这一个文件。
import { STOCK_MAP, sinaSymbol } from "@/data/stocks";

export interface Quote {
  price: number;
  change: number; // 日涨跌 %
  asOf?: string; // 行情日期 YYYY-MM-DD(美股=美东交易日;用于判断是否陈旧/休市)
}

const r2 = (v: number) => Math.round(v * 100) / 100;
const CHUNK = 50;
// 超时阈值:env 解析失败(空串/非数字 → NaN,?? 不挡)时回退 6000,
// 否则 setTimeout(abort, 0|NaN) 会"每次秒 abort",整站行情静默归零。
const parsedTimeout = Number(process.env.QUOTES_FETCH_TIMEOUT_MS);
const FETCH_TIMEOUT_MS =
  Number.isFinite(parsedTimeout) && parsedTimeout > 0 ? parsedTimeout : 6000;

// 带超时的抓取「并读完 body」:行情源从机房 IP 偶发被限流/卡死。计时器覆盖 fetch + body 读完整,
// abort 信号贯穿——"头快体卡"也能被打断(原实现只盖到响应头,body 仍会挂到平台上限,已踩 71s)。
// 超时(AbortError)记一条 warn 便于定位,再交由上层 catch 成空 → 回落另一源 / 读缓存。
async function fetchTextGbk(url: string, opts: RequestInit): Promise<string> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);
  try {
    const resp = await fetch(url, { ...opts, signal: ctrl.signal });
    if (!resp.ok) throw new Error(`http ${resp.status}`);
    const buf = await resp.arrayBuffer(); // 在同一计时器/abort 下读体
    return new TextDecoder("gbk").decode(buf);
  } catch (e) {
    if ((e as { name?: string })?.name === "AbortError")
      console.warn(`[quotes] 抓取超时 ${FETCH_TIMEOUT_MS}ms abort: ${url.slice(0, 80)}`);
    throw e;
  } finally {
    clearTimeout(t);
  }
}

// ===== 新浪源 =====
function parseSina(text: string, codeBySym: Record<string, string>) {
  const out: Record<string, Quote> = {};
  const re = /var hq_str_([a-z0-9_$]+)="([^"]*)";/g; // $ 用于美股指数符号 gb_$ixic 等
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    const sym = m[1];
    const fields = m[2].split(",");
    const code = codeBySym[sym];
    if (!code || fields.length < 3 || !fields[0]) continue;

    let price = NaN;
    let change = NaN;
    if (sym.startsWith("gb_")) {
      price = parseFloat(fields[1]);
      change = parseFloat(fields[2]);
    } else {
      const prevClose = parseFloat(fields[2]);
      price = parseFloat(fields[3]);
      if (prevClose > 0 && price > 0) change = ((price - prevClose) / prevClose) * 100;
    }
    const dt = fields.find((f) => /^\d{4}-\d{2}-\d{2}/.test(f));
    const asOf = dt ? dt.slice(0, 10) : undefined;
    if (Number.isFinite(price) && price > 0 && Number.isFinite(change)) {
      out[code] = { price: r2(price), change: r2(change), asOf };
    }
  }
  return out;
}

async function fetchSinaChunk(
  codes: string[],
  symbolOf: (code: string) => string
): Promise<Record<string, Quote>> {
  const codeBySym: Record<string, string> = {};
  const list = codes.map((code) => {
    const sym = symbolOf(code);
    codeBySym[sym] = code;
    return sym;
  });
  const text = await fetchTextGbk(`https://hq.sinajs.cn/list=${list.join(",")}`, {
    headers: {
      Referer: "https://finance.sina.com.cn",
      "User-Agent":
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
    },
    cache: "no-store",
  });
  return parseSina(text, codeBySym);
}

// ===== 腾讯源(后备)。gtimg 字段:[3]现价 [4]昨收 [30]时间(A股 14位 / 美股带横杠);A股美股一致。=====
function tencentSymbol(s: { code: string; market: string }): string {
  if (s.market === "美股") return `us${s.code.toUpperCase()}`;
  const c = s.code;
  if (c.startsWith("6") || c.startsWith("9") || c.startsWith("5")) return `sh${c}`;
  if (c.startsWith("4") || c.startsWith("8")) return `bj${c}`;
  return `sz${c}`;
}

function parseTencent(text: string, codeBySym: Record<string, string>) {
  const out: Record<string, Quote> = {};
  const re = /v_([a-zA-Z0-9]+)="([^"]*)";/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    const code = codeBySym[m[1]];
    if (!code) continue;
    const f = m[2].split("~");
    if (f.length < 6) continue;
    const price = parseFloat(f[3]);
    const prevClose = parseFloat(f[4]);
    let change = NaN;
    if (prevClose > 0 && price > 0) change = ((price - prevClose) / prevClose) * 100;
    const digits = (f[30] || "").replace(/\D/g, "").slice(0, 8); // YYYYMMDD
    const asOf =
      digits.length === 8
        ? `${digits.slice(0, 4)}-${digits.slice(4, 6)}-${digits.slice(6, 8)}`
        : undefined;
    if (Number.isFinite(price) && price > 0 && Number.isFinite(change)) {
      out[code] = { price: r2(price), change: r2(change), asOf };
    }
  }
  return out;
}

async function fetchTencentChunk(
  codes: string[],
  symbolOf: (code: string) => string
): Promise<Record<string, Quote>> {
  const codeBySym: Record<string, string> = {};
  const list = codes.map((code) => {
    const sym = symbolOf(code);
    codeBySym[sym] = code;
    return sym;
  });
  const text = await fetchTextGbk(`https://qt.gtimg.cn/q=${list.join(",")}`, {
    headers: {
      Referer: "https://gu.qq.com",
      "User-Agent":
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
    },
    cache: "no-store",
  });
  return parseTencent(text, codeBySym);
}

// 主源腾讯 → 只对"缺失/超时的那批"用新浪补齐(而非"腾讯全空才整体回落")。两源符号映射不同。
// 为什么是补缺而非全空回落:每批 6s 超时后"部分成功"是常态;若只在全空时回落,超时那批会
// 静默缺价、却仍报 live:true,脏数据会污染 DB/进程缓存、简报 movers、盘中提醒、战绩评分。
async function fetchWithFallback(
  valid: string[],
  sinaSymbolOf: (code: string) => string,
  tencentSymbolOf: (code: string) => string
): Promise<{ quotes: Record<string, Quote>; live: boolean }> {
  if (valid.length === 0) return { quotes: {}, live: false };

  // 按 CHUNK 分批抓某一源;每批独立 catch 成空,互不拖累。
  const runFor = async (
    codes: string[],
    fetcher: (c: string[], s: (code: string) => string) => Promise<Record<string, Quote>>,
    symbolOf: (code: string) => string
  ) => {
    const chunks: string[][] = [];
    for (let i = 0; i < codes.length; i += CHUNK) chunks.push(codes.slice(i, i + CHUNK));
    const results = await Promise.all(
      chunks.map((c) => fetcher(c, symbolOf).catch(() => ({} as Record<string, Quote>)))
    );
    return Object.assign({}, ...results) as Record<string, Quote>;
  };

  // 主源改腾讯:新浪对机房/Vercel IP 返 403 且慢速拒绝拖 ~5s(实测 Vercel 香港区 403/5s),
  // 腾讯从同环境稳定 20–100ms。故腾讯优先,新浪仅补腾讯缺失的(本地等非机房环境新浪仍可用)。
  const quotes = await runFor(valid, fetchTencentChunk, tencentSymbolOf);
  const missing = valid.filter((c) => !(c in quotes));
  if (missing.length > 0) {
    const backup = await runFor(missing, fetchSinaChunk, sinaSymbolOf);
    Object.assign(quotes, backup); // 新浪只补腾讯缺失的,不覆盖已有(腾讯优先)
  }
  return { quotes, live: Object.keys(quotes).length > 0 };
}

export async function fetchQuotes(
  codes: string[]
): Promise<{ quotes: Record<string, Quote>; live: boolean }> {
  const valid = codes.filter((c) => STOCK_MAP[c]);
  return fetchWithFallback(
    valid,
    (code) => sinaSymbol(STOCK_MAP[code]),
    (code) => tencentSymbol(STOCK_MAP[code])
  );
}

// 隔夜美股大盘 context:纳指/标普500/费城半导体(SOX)。给情绪仪表盘做"beta vs 产业 alpha"参照——
// 看 NVDA+3% 时,同时看到纳指/费半,才知道是普涨还是产业超额。新浪 gb_$ 与美股个股同格式;
// 腾讯仅作整体回落(SOX 在腾讯无 usSOX,回落时该项缺失,可接受)。
const US_INDICES = [
  { key: "IXIC", name: "纳指", sina: "gb_$ixic", tencent: "usIXIC" },
  { key: "INX", name: "标普", sina: "gb_$inx", tencent: "usINX" },
  { key: "SOX", name: "费半", sina: "gb_$sox", tencent: "usSOX" },
] as const;

export interface IndexQuote {
  name: string;
  change: number; // 日涨跌 %
  asOf?: string;
}

export async function fetchUsIndices(): Promise<IndexQuote[]> {
  const sMap: Record<string, string> = {};
  const tMap: Record<string, string> = {};
  for (const i of US_INDICES) {
    sMap[i.key] = i.sina;
    tMap[i.key] = i.tencent;
  }
  const { quotes } = await fetchWithFallback(
    US_INDICES.map((i) => i.key),
    (code) => sMap[code],
    (code) => tMap[code]
  );
  const out: IndexQuote[] = [];
  for (const i of US_INDICES) {
    const q = quotes[i.key];
    if (q && Number.isFinite(q.change)) {
      out.push({ name: i.name, change: q.change, asOf: q.asOf });
    }
  }
  return out;
}

// 板块 ETF 行情:ETF 不在 STOCK_MAP 里,按 A 股直接构造符号(sina/腾讯都支持 5 开头沪市 ETF)。
export async function fetchEtfQuotes(
  codes: string[]
): Promise<{ quotes: Record<string, Quote>; live: boolean }> {
  const valid = Array.from(new Set(codes)).filter((c) => /^\d{6}$/.test(c));
  return fetchWithFallback(
    valid,
    (code) => sinaSymbol({ code, market: "A股" }),
    (code) => tencentSymbol({ code, market: "A股" })
  );
}
