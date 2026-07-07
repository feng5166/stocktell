import { NextRequest, NextResponse } from "next/server";
import { listBriefing, type BriefingStatus } from "@/lib/briefings";
import { getBriefStatus } from "@/lib/brief-status";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const date = req.nextUrl.searchParams.get("date") ?? undefined;
  const status =
    (req.nextUrl.searchParams.get("status") as BriefingStatus | null) ??
    undefined;
  try {
    const items = await listBriefing({ date, status });
    // 指定日期时附上该日简报状态(2.1-A):历史简报的"当天为什么没有/是什么口径"从这里读,
    // generated/fallback/blocked/market_closed/failed 语义见 lib/brief-status.ts。
    const briefStatus = date ? await getBriefStatus(date).catch(() => null) : null;
    return NextResponse.json({ ok: true, items, ...(date ? { briefStatus } : {}) });
  } catch (e) {
    return NextResponse.json({ ok: false, error: String(e) }, { status: 500 });
  }
}
