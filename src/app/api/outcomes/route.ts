import { NextRequest, NextResponse } from "next/server";
import { pageOutcomes } from "@/lib/outcomes";

export const dynamic = "force-dynamic";

// 战绩明细分页(游标):?backtest=0|1&cursor=上一页最后一行id&limit=(默认 20,上限 50)。
export async function GET(req: NextRequest) {
  const backtest = req.nextUrl.searchParams.get("backtest") === "1";
  const cursor = req.nextUrl.searchParams.get("cursor") || null;
  const limit = Math.min(
    50,
    Math.max(1, Number(req.nextUrl.searchParams.get("limit")) || 20)
  );
  try {
    const { rows, hasMore, nextCursor } = await pageOutcomes(backtest, cursor, limit);
    return NextResponse.json({ ok: true, rows, hasMore, nextCursor });
  } catch {
    // 游标行被删等异常:安全降级为"没有更多"
    return NextResponse.json({ ok: true, rows: [], hasMore: false, nextCursor: null });
  }
}
