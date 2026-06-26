// 新浪行情抓取(A股 sh/sz/bj + 美股 gb_),GBK 解码。
// 后续要换 Polygon.io / AKShare,只改这一个文件。
import { STOCK_MAP, sinaSymbol } from "@/data/stocks";

export interface Quote {
  price: number;
  change: number; // 日涨跌 %
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
    if (Number.isFinite(price) && price > 0 && Number.isFinite(change)) {
      out[code] = {
        price: Math.round(price * 100) / 100,
        change: Math.round(change * 100) / 100,
      };
    }
  }
  return out;
}

export async function fetchQuotes(
  codes: string[]
): Promise<{ quotes: Record<string, Quote>; live: boolean }> {
  const valid = codes.filter((c) => STOCK_MAP[c]);
  if (valid.length === 0) return { quotes: {}, live: false };

  const codeBySina: Record<string, string> = {};
  const sinaList = valid.map((code) => {
    const sym = sinaSymbol(STOCK_MAP[code]);
    codeBySina[sym] = code;
    return sym;
  });

  try {
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
    const quotes = parseSina(text, codeBySina);
    return { quotes, live: Object.keys(quotes).length > 0 };
  } catch {
    return { quotes: {}, live: false };
  }
}
