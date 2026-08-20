import { NextRequest, NextResponse } from "next/server";
import { withMetrics } from "@/lib/metrics";
import { fundBehaviorFor } from "@/lib/fund-behavior";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export const POST = withMetrics("fund-behavior", _POST);
async function _POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const codes = Array.isArray(body.codes)
    ? body.codes.filter((code: unknown): code is string => typeof code === "string").slice(0, 500)
    : [];
  const result = await fundBehaviorFor(codes);
  return NextResponse.json({ ok: true, ...result });
}

