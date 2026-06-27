import { NextRequest, NextResponse } from "next/server";
import { runWeixinPush } from "@/lib/push-weixin";
import { isCronAuthorized } from "@/lib/api-guard";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(req: NextRequest) {
  if (!isCronAuthorized(req)) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }
  const result = await runWeixinPush();
  return NextResponse.json(result);
}
