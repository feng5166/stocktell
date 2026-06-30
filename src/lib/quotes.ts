// 行情抓取:主源新浪(hq.sinajs.cn),失败时自动回落腾讯(qt.gtimg.cn),消除单点。
// 两源都 GBK 解码。后续要换 Polygon.io / AKShare,只改这一个文件。
import { STOCK_MAP, sinaSymbol } from "@/data/stocks";

export interface Quote {
  price: number;
  change: number; // 日涨跌 %
  asOf?: string; // 行情日期 YYYY-MM-DD(美股=美东交易日;用于判断是否陈旧/休市)
}

const r2 = (v: number) => Math.round(v * 100) / 100;
const CHUNK = 50;
const FETCH_TIMEOUT_MS = Number(process.env.QUOTES_FETCH_TIMEOUT_MS ?? 6000);

// 带超时的 fetch:行情源(新浪/腾讯)从机房 IP 抓取偶发被限流/卡死,无超时会一直挂到平台上限
// (已踩:/api/quotes 71s)。超时即 abort,由上层 catch 成空 → 回落另一源 / 读缓存。
async function fetchWithTimeout(url: string, opts: RequestInit): Promise<Response> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);
  try {
    return await fetch(url, { ...opts, signal: ctrl.signal });
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
  const resp = await fetchWithTimeout(`https://hq.sinajs.cn/list=${list.join(",")}`, {
    headers: {
      Referer: "https://finance.sina.com.cn",
      "User-Agent":
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
    },
    cache: "no-store",
  });
  if (!resp.ok) throw new Error(`sina ${resp.status}`);
  const buf = await resp.arrayBuffer();
  return parseSina(new TextDecoder("gbk").decode(buf), codeBySym);
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
  const resp = await fetchWithTimeout(`https://qt.gtimg.cn/q=${list.join(",")}`, {
    headers: {
      Referer: "https://gu.qq.com",
      "User-Agent":
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
    },
    cache: "no-store",
  });
  if (!resp.ok) throw new Error(`tencent ${resp.status}`);
  const buf = await resp.arrayBuffer();
  return parseTencent(new TextDecoder("gbk").decode(buf), codeBySym);
}

// 主源新浪 → 全空(机房 IP 被封 / 源故障)时整体回落腾讯。两源符号映射不同,各传一个。
async function fetchWithFallback(
  valid: string[],
  sinaSymbolOf: (code: string) => string,
  tencentSymbolOf: (code: string) => string
): Promise<{ quotes: Record<string, Quote>; live: boolean }> {
  if (valid.length === 0) return { quotes: {}, live: false };
  const chunks: string[][] = [];
  for (let i = 0; i < valid.length; i += CHUNK) chunks.push(valid.slice(i, i + CHUNK));

  const run = async (
    fetcher: (c: string[], s: (code: string) => string) => Promise<Record<string, Quote>>,
    symbolOf: (code: string) => string
  ) => {
    const results = await Promise.all(
      chunks.map((c) => fetcher(c, symbolOf).catch(() => ({} as Record<string, Quote>)))
    );
    return Object.assign({}, ...results) as Record<string, Quote>;
  };

  let quotes = await run(fetchSinaChunk, sinaSymbolOf);
  if (Object.keys(quotes).length === 0) {
    // 新浪整体没数据 → 腾讯后备
    quotes = await run(fetchTencentChunk, tencentSymbolOf);
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
