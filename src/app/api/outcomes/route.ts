import { NextRequest, NextResponse } from "next/server";
import { pageOutcomes } from "@/lib/outcomes";

export const dynamic = "force-dynamic";

// 战绩明细分页:?backtest=0|1&offset=&limit=(默认 20,上限 50)。
export async function GET(req: NextRequest) {
  const backtest = req.nextUrl.searchParams.get("backtest") === "1";
  const offset = Math.max(0, Number(req.nextUrl.searchParams.get("offset")) || 0);
  const limit = Math.min(
    50,
    Math.max(1, Number(req.nextUrl.searchParams.get("limit")) || 20)
  );
  const { rows, hasMore } = await pageOutcomes(backtest, offset, limit);
  return NextResponse.json({ ok: true, rows, hasMore });
}
