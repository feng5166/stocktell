import { NextRequest, NextResponse } from "next/server";
import { listBriefing, type BriefingStatus } from "@/lib/briefings";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const date = req.nextUrl.searchParams.get("date") ?? undefined;
  const status =
    (req.nextUrl.searchParams.get("status") as BriefingStatus | null) ??
    undefined;
  try {
    const items = await listBriefing({ date, status });
    return NextResponse.json({ ok: true, items });
  } catch (e) {
    return NextResponse.json({ ok: false, error: String(e) }, { status: 500 });
  }
}
