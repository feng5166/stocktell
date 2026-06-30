import { NextRequest, NextResponse } from "next/server";
import { withMetrics } from "@/lib/metrics";
import { unstable_cache } from "next/cache";
import { fetchFundamental } from "@/lib/tushare";
import { singleFlight } from "@/lib/single-flight";

export const dynamic = "force-dynamic";

// 基本面(daily_basic)天内基本不变,原本每次开详情页都现拉 Tushare。
// 按 code 缓存 1 小时(Next Data Cache,跨请求/实例),基本面区块秒回、省额度。
// catch 放缓存外层:失败(抛错)不缓存,避免瞬时抖动把 null 毒化进 1h 缓存。
// 单飞:缓存冷窗口下同实例并发只回源一次。
const cachedFundamental = unstable_cache(
  async (code: string) => singleFlight(`fundamental:${code}`, () => fetchFundamental(code)),
  ["fundamental"],
  { revalidate: 3600 }
);

export const GET = withMetrics("fundamentals", _GET);
async function _GET(req: NextRequest) {
  const code = req.nextUrl.searchParams.get("code");
  if (!code) return NextResponse.json({ ok: false, error: "缺少 code" }, { status: 400 });
  const f = await cachedFundamental(code).catch(() => null);
  return NextResponse.json({ ok: true, fundamental: f });
}
