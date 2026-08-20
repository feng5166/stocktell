import { NextResponse } from "next/server";
import { withMetrics } from "@/lib/metrics";
import { segmentFundStatus } from "@/lib/segment-fund-status";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

export const GET = withMetrics("segment-fund-status", _GET);
async function _GET() {
  const data = await segmentFundStatus();
  return NextResponse.json({ ok: true, ...data });
}
