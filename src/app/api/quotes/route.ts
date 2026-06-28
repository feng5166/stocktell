import { NextRequest, NextResponse } from "next/server";
import { STOCK_MAP } from "@/data/stocks";
import { fetchQuotes } from "@/lib/quotes";
import { writeQuotesCache, readQuotesCache } from "@/lib/quotes-cache";

export const dynamic = "force-dynamic";
export const revalidate = 0;

// 全池请求(无 symbols,= 股票池每 20s 轮询的主力流量)在热实例内做 ~15s TTL 去重:
// 否则每个在线用户每 20s 各触发一次"全池新浪抓取",用户一多就是持续高频外部请求。
const POOL_TTL = 15_000;
let poolCache: { at: number; payload: unknown } | null = null;

export async function GET(req: NextRequest) {
  const param = req.nextUrl.searchParams.get("symbols");

  if (!param && poolCache && Date.now() - poolCache.at < POOL_TTL) {
    return NextResponse.json(poolCache.payload);
  }

  const codes = param
    ? param.split(",").filter((c) => STOCK_MAP[c])
    : Object.keys(STOCK_MAP);
  const { quotes, live } = await fetchQuotes(codes);

  let payload: unknown;
  if (live) {
    // 行情连上 → 刷新缓存为真实数据(只在全量请求时写,避免子集污染缓存)
    if (!param) await writeQuotesCache(quotes);
    payload = { quotes, live: true, cached: false, asOf: null };
  } else {
    // 行情未连接 → 读缓存(上次真实行情),带上"截至几号"
    const cache = await readQuotesCache();
    payload = cache
      ? { quotes: cache.quotes, live: false, cached: true, asOf: cache.asOf }
      : { quotes, live: false, cached: false, asOf: null };
  }
  if (!param) poolCache = { at: Date.now(), payload };
  return NextResponse.json(payload);
}
