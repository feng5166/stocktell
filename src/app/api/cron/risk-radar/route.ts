import { NextRequest, NextResponse } from "next/server";
import { runRiskRadar } from "@/lib/risk-radar";
import { isCronAuthorized } from "@/lib/api-guard";
import { alertCron } from "@/lib/monitor";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// 雷区雷达推送:每日盘前(GH Actions 触发)。独立一条「雷区提醒」,不并入早报。
export async function GET(req: NextRequest) {
  if (!isCronAuthorized(req)) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }
  try {
    return NextResponse.json(await runRiskRadar());
  } catch (e) {
    await alertCron("risk-radar(雷区提醒)", e);
    return NextResponse.json({ ok: false, error: String(e) }, { status: 500 });
  }
}
