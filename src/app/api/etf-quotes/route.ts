import { NextRequest, NextResponse } from "next/server";
import { withMetrics } from "@/lib/metrics";
import { fetchEtfQuotes } from "@/lib/quotes";
import { writeQuotesCache, readQuotesCache } from "@/lib/quotes-cache";
import { ETF_CODES } from "@/data/etfs";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const ETF_CACHE_ID = "etf";

// 板块 ETF 行情:连上 → 刷新缓存为真实数据;断连 → 读缓存(上次真实行情)+ 截至几号。
// ?symbols=code,code(个股页"相关ETF"弹框用任意 ETF 子集):直接抓、不写共享缓存(避免子集污染全池)。
export const GET = withMetrics("etf-quotes", _GET);
async function _GET(req: NextRequest) {
  const symbols = req.nextUrl.searchParams.get("symbols");
  if (symbols) {
    const codes = symbols.split(",").filter((c) => /^\d{6}$/.test(c)).slice(0, 20);
    const { quotes, live } = await fetchEtfQuotes(codes);
    return NextResponse.json({ quotes, live, cached: false, asOf: null });
  }
  const { quotes, live } = await fetchEtfQuotes(ETF_CODES);
  if (live) {
    await writeQuotesCache(quotes, ETF_CACHE_ID);
    return NextResponse.json({ quotes, live: true, cached: false, asOf: null });
  }
  const cache = await readQuotesCache(ETF_CACHE_ID);
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
