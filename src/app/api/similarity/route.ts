import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { similarityFor, type SimilarityResult } from "@/lib/similarity";
import { singleFlight } from "@/lib/single-flight";
import { getPrisma } from "@/lib/prisma";
import { todayISO } from "@/lib/date";
import { alertThrottled } from "@/lib/monitor";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

// 2 年历史统计天内几乎不变,却每次开详情页都要现拉 2 年 Yahoo + 2 年 Tushare 日线。
// DB 跨实例缓存(quotes_cache,id=sim:code:当天):命中秒回、省额度;冷实例不再各拉一遍
//(原 unstable_cache 不跨实例)。payload 包一层 { result } —— 让"合法无相似性(null)"也能被缓存住
//(否则 if(row.data) 判空会把 null 当未命中、天天重算)。真失败(similarityFor 抛错)不写、发飞书告警。
async function cachedSimilarity(code: string): Promise<SimilarityResult | null> {
  const id = `sim:${code}:${todayISO()}`;
  const db = getPrisma();
  if (db) {
    const row = await db.quotesCache
      .findUnique({ where: { id }, select: { data: true } })
      .catch(() => null);
    if (row?.data) return (row.data as { result: SimilarityResult | null }).result ?? null;
  }
  let result: SimilarityResult | null;
  try {
    result = await singleFlight(`similarity:${code}`, () => similarityFor(code));
  } catch (e) {
    await alertThrottled(
      "fetch-fail:similarity",
      `⚠️ StockTell 历史相似性获取失败(Yahoo/Tushare)| code=${code}\n${
        e instanceof Error ? e.message : String(e)
      }`
    );
    return null;
  }
  if (db) {
    const data = { result } as unknown as Prisma.InputJsonValue;
    await db.quotesCache
      .upsert({ where: { id }, create: { id, data }, update: { data } })
      .catch(() => {});
  }
  return result;
}

// 历史相似性:某 A 股 vs 其主关联美股的历史统计。?code=六位A股代码。
export async function GET(req: NextRequest) {
  const code = req.nextUrl.searchParams.get("code") || "";
  const result = code ? await cachedSimilarity(code) : null;
  return NextResponse.json({ ok: true, result });
}
