import { NextRequest, NextResponse } from "next/server";
import { runWebPush } from "@/lib/push-web";
import { isCronAuthorized } from "@/lib/api-guard";
import { alertCron } from "@/lib/monitor";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

// Web Push 兜底触发端点(CRON_SECRET 鉴权)。主路径已折进 briefing cron(简报发布后立即推),
// 此端点保留作手动/补推用。发送逻辑统一在 lib/push-web.ts。
export async function GET(req: NextRequest) {
  if (!isCronAuthorized(req)) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }
  try {
    const r = await runWebPush();
    return NextResponse.json(r);
  } catch (e) {
    await alertCron("push-web(网页推送)", e);
    return NextResponse.json({ ok: false, error: String(e) }, { status: 500 });
  }
}
