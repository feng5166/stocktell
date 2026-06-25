import { NextRequest, NextResponse } from "next/server";
import { STOCK_MAP, sinaSymbol } from "@/data/stocks";

export const dynamic = "force-dynamic";
export const revalidate = 0;

interface Quote {
  price: number;
  change: number; // 日涨跌 %
}

// 解析新浪行情返回文本(GBK 已解码)
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
      // 美股:name, 最新价, 涨跌幅%, ...
      price = parseFloat(fields[1]);
      change = parseFloat(fields[2]);
    } else {
      // A股:name, 今开, 昨收, 当前价, 最高, 最低, ...
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

export async function GET(req: NextRequest) {
  const param = req.nextUrl.searchParams.get("symbols");
  const codes = param
    ? param.split(",").filter((c) => STOCK_MAP[c])
    : Object.keys(STOCK_MAP);

  if (codes.length === 0) {
    return NextResponse.json({ quotes: {}, live: false });
  }

  const codeBySina: Record<string, string> = {};
  const sinaList = codes.map((code) => {
    const sym = sinaSymbol(STOCK_MAP[code]);
    codeBySina[sym] = code;
    return sym;
  });

  try {
    const resp = await fetch(
      `https://hq.sinajs.cn/list=${sinaList.join(",")}`,
      {
        headers: {
          Referer: "https://finance.sina.com.cn",
          "User-Agent":
            "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
        },
        cache: "no-store",
      }
    );
    if (!resp.ok) throw new Error(`sina ${resp.status}`);
    const buf = await resp.arrayBuffer();
    const text = new TextDecoder("gbk").decode(buf);
    const quotes = parseSina(text, codeBySina);
    return NextResponse.json({
      quotes,
      live: Object.keys(quotes).length > 0,
    });
  } catch (e) {
    return NextResponse.json(
      { quotes: {}, live: false, error: String(e) },
      { status: 200 }
    );
  }
}
