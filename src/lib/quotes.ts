// 新浪行情抓取(A股 sh/sz/bj + 美股 gb_),GBK 解码。
// 后续要换 Polygon.io / AKShare,只改这一个文件。
import { STOCK_MAP, sinaSymbol } from "@/data/stocks";

export interface Quote {
  price: number;
  change: number; // 日涨跌 %
  asOf?: string; // 行情日期 YYYY-MM-DD(美股=美东交易日;用于判断是否陈旧/休市)
}

function parseSina(text: string, codeBySina: Record<string, string>) {
  const out: Record<string, Quote> = {};
  const re = /var hq_str_([a-z0-9_]+)="([^"]*)";/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    const sina = m[1];
    const fields = m[2].split(",");
    const code = codeBySina[sina];
    if (!code || fields.length < 3 || !fields[0]) continue;

    let price = NaN;
    let change = NaN;
    if (sina.startsWith("gb_")) {
      price = parseFloat(fields[1]);
      change = parseFloat(fields[2]);
    } else {
      const prevClose = parseFloat(fields[2]);
      price = parseFloat(fields[3]);
      if (prevClose > 0 && price > 0) {
        change = ((price - prevClose) / prevClose) * 100;
      }
    }
    // 行情日期:新浪美股/ A 股串里都带一个 "YYYY-MM-DD ..." 字段,按正则取首个日期
    const dt = fields.find((f) => /^\d{4}-\d{2}-\d{2}/.test(f));
    const asOf = dt ? dt.slice(0, 10) : undefined;
    if (Number.isFinite(price) && price > 0 && Number.isFinite(change)) {
      out[code] = {
        price: Math.round(price * 100) / 100,
        change: Math.round(change * 100) / 100,
        asOf,
      };
    }
  }
  return out;
}

// 新浪单次请求代码数有限,分批拉取再合并
const CHUNK = 50;

async function fetchChunk(codes: string[]): Promise<Record<string, Quote>> {
  const codeBySina: Record<string, string> = {};
  const sinaList = codes.map((code) => {
    const sym = sinaSymbol(STOCK_MAP[code]);
    codeBySina[sym] = code;
    return sym;
  });
  const resp = await fetch(`https://hq.sinajs.cn/list=${sinaList.join(",")}`, {
    headers: {
      Referer: "https://finance.sina.com.cn",
      "User-Agent":
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
    },
    cache: "no-store",
  });
  if (!resp.ok) throw new Error(`sina ${resp.status}`);
  const buf = await resp.arrayBuffer();
  const text = new TextDecoder("gbk").decode(buf);
  return parseSina(text, codeBySina);
}

export async function fetchQuotes(
  codes: string[]
): Promise<{ quotes: Record<string, Quote>; live: boolean }> {
  const valid = codes.filter((c) => STOCK_MAP[c]);
  if (valid.length === 0) return { quotes: {}, live: false };

  const chunks: string[][] = [];
  for (let i = 0; i < valid.length; i += CHUNK) {
    chunks.push(valid.slice(i, i + CHUNK));
  }
  try {
    const results = await Promise.all(
      chunks.map((c) => fetchChunk(c).catch(() => ({} as Record<string, Quote>)))
    );
    const quotes: Record<string, Quote> = Object.assign({}, ...results);
    return { quotes, live: Object.keys(quotes).length > 0 };
  } catch {
    return { quotes: {}, live: false };
  }
}
