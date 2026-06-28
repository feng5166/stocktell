import { NextRequest, NextResponse } from "next/server";
import { runWeixinPush } from "@/lib/push-weixin";
import { isCronAuthorized } from "@/lib/api-guard";
import { alertCron } from "@/lib/monitor";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(req: NextRequest) {
  if (!isCronAuthorized(req)) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }
  try {
    const result = await runWeixinPush();
    return NextResponse.json(result);
  } catch (e) {
    await alertCron("push-weixin(微信推送)", e);
    return NextResponse.json({ ok: false, error: String(e) }, { status: 500 });
  }
}
