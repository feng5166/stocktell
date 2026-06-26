import { NextRequest, NextResponse } from "next/server";
import { todayISO } from "@/lib/generate";
import { recordOutcomes } from "@/lib/outcomes";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Asia/Shanghai 星期(0=周日 .. 6=周六)
function beijingWeekday(): number {
  const s = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Shanghai",
    weekday: "short",
  }).format(new Date());
  const map: Record<string, number> = {
    Sun: 0,
    Mon: 1,
    Tue: 2,
    Wed: 3,
    Thu: 4,
    Fri: 5,
    Sat: 6,
  };
  return map[s] ?? -1;
}

// A 股收盘后跑:把当天简报的受益股实际表现记账,供 /track 查账。
export async function GET(req: NextRequest) {
  // 鉴权:Vercel cron 带 Authorization: Bearer ${CRON_SECRET}
  const secret = process.env.CRON_SECRET;
  if (secret) {
    if (req.headers.get("authorization") !== `Bearer ${secret}`) {
      return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
    }
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
