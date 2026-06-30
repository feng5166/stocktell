import { NextRequest, NextResponse } from "next/server";
import { recordOutcomes } from "@/lib/outcomes";
import { todayISO } from "@/lib/date";
import { isAshareTradingDay } from "@/lib/tushare";
import { isCronAuthorized } from "@/lib/api-guard";
import { alertCron } from "@/lib/monitor";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// A 股收盘后跑:把当天简报的受益股实际表现记账,供 /track 查账。
export async function GET(req: NextRequest) {
  // 鉴权:Vercel cron 带 Authorization: Bearer ${CRON_SECRET}
  if (!isCronAuthorized(req)) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  // 只在 A 股交易日记账(Tushare 交易日历,含节假日;不可用时回退周末判断)
  const date = todayISO();
  if (!(await isAshareTradingDay(date))) {
    return NextResponse.json({ ok: true, skipped: "non-trading-day", date });
  }

  try {
    const res = await recordOutcomes(date);
    // 交易日却没简报可记 = 当天早盘简报没发出来(已知静默失败模式)。
    // 这是第二道网:15:30 再喊一次,提醒去查/补当天简报 + 事后 backfill-outcomes。
    if (res.skipped === "no-briefing") {
      await alertCron(
        "outcome(记账)",
        `交易日 ${date} 收盘记账时无已发布简报 —— 当天早盘简报很可能没发出来,需补发并用 /api/admin/backfill-outcomes?date=${date} 补回查账`
      );
    }
    return NextResponse.json({ date, ...res });
  } catch (e) {
    await alertCron("outcome(记账)", e);
    return NextResponse.json({ ok: false, error: String(e) }, { status: 500 });
  }
}
