import { NextRequest, NextResponse } from "next/server";
import { runWeixinPush } from "@/lib/push-weixin";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (secret && req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }
  const result = await runWeixinPush();
  return NextResponse.json(result);
}
