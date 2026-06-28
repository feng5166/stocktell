import { NextRequest, NextResponse } from "next/server";
import { unstable_cache } from "next/cache";
import { similarityFor } from "@/lib/similarity";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

// 2 年历史统计天内几乎不变,却原本每次开详情页都现拉 2 年 Yahoo + 2 年 Tushare 日线。
// 用 Next Data Cache(跨请求/实例持久)按 code 缓存 6 小时,相似度区块秒回、省 Tushare 额度。
const cachedSimilarity = unstable_cache(
  async (code: string) => similarityFor(code).catch(() => null),
  ["similarity"],
  { revalidate: 21600 }
);

// 历史相似性:某 A 股 vs 其主关联美股的历史统计。?code=六位A股代码。
export async function GET(req: NextRequest) {
  const code = req.nextUrl.searchParams.get("code") || "";
  const result = code ? await cachedSimilarity(code) : null;
  return NextResponse.json({ ok: true, result });
}
