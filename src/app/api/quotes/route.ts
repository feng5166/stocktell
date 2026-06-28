import { NextRequest, NextResponse } from "next/server";
import { STOCK_MAP } from "@/data/stocks";
import { fetchQuotes } from "@/lib/quotes";
import { writeQuotesCache, readQuotesCache } from "@/lib/quotes-cache";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(req: NextRequest) {
  const param = req.nextUrl.searchParams.get("symbols");
  const codes = param
    ? param.split(",").filter((c) => STOCK_MAP[c])
    : Object.keys(STOCK_MAP);
  const { quotes, live } = await fetchQuotes(codes);

  if (live) {
    // 行情连上 → 刷新缓存为真实数据(只在全量请求时写,避免子集污染缓存)
    if (!param) await writeQuotesCache(quotes);
    return NextResponse.json({ quotes, live: true, cached: false, asOf: null });
  }

  // 行情未连接 → 读缓存(上次真实行情),带上"截至几号"
  const cache = await readQuotesCache();
  if (cache) {
    return NextResponse.json({
      quotes: cache.quotes,
      live: false,
      cached: true,
      asOf: cache.asOf,
    });
  }
  return NextResponse.json({ quotes, live: false, cached: false, asOf: null });
}
