import { NextRequest, NextResponse } from "next/server";
import { recordOutcomes } from "@/lib/outcomes";
import { todayISO, beijingWeekday } from "@/lib/date";
import { isCronAuthorized } from "@/lib/api-guard";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// A 股收盘后跑:把当天简报的受益股实际表现记账,供 /track 查账。
export async function GET(req: NextRequest) {
  // 鉴权:Vercel cron 带 Authorization: Bearer ${CRON_SECRET}
  if (!isCronAuthorized(req)) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  // 周末 A 股不开盘,无需记账
  const wd = beijingWeekday();
  if (wd === 0 || wd === 6) {
    return NextResponse.json({ ok: true, skipped: "weekend" });
  }

  const date = todayISO();
  try {
    const res = await recordOutcomes(date);
    return NextResponse.json({ date, ...res });
  } catch (e) {
    return NextResponse.json({ ok: false, error: String(e) }, { status: 500 });
  }
}
