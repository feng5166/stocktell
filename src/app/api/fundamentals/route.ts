import { NextRequest, NextResponse } from "next/server";
import { unstable_cache } from "next/cache";
import { fetchFundamental } from "@/lib/tushare";

export const dynamic = "force-dynamic";

// 基本面(daily_basic)天内基本不变,原本每次开详情页都现拉 Tushare。
// 按 code 缓存 1 小时(Next Data Cache,跨请求/实例),基本面区块秒回、省额度。
const cachedFundamental = unstable_cache(
  async (code: string) => fetchFundamental(code).catch(() => null),
  ["fundamental"],
  { revalidate: 3600 }
);

export async function GET(req: NextRequest) {
  const code = req.nextUrl.searchParams.get("code");
  if (!code) return NextResponse.json({ ok: false, error: "缺少 code" }, { status: 400 });
  const f = await cachedFundamental(code);
  return NextResponse.json({ ok: true, fundamental: f });
}
