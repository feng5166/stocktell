import { NextRequest, NextResponse } from "next/server";
import { listBriefing } from "@/lib/briefings";
import { todayISO } from "@/lib/date";
import { isAshareTradingDay } from "@/lib/tushare";
import { isCronAuthorized } from "@/lib/api-guard";
import { alertCron } from "@/lib/monitor";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

// 看门狗:08:30 北京,交易日若仍无已发布简报 → 主 cron(07:00)+ 补位(07:40)都没产出,
// 发飞书让人工补,把"静默漏一整天"变成"立刻可感知"。
export async function GET(req: NextRequest) {
  if (!isCronAuthorized(req)) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }
  const date = todayISO();
  if (!(await isAshareTradingDay(date))) {
    return NextResponse.json({ ok: true, skipped: "non-trading-day", date });
  }
  const items = await listBriefing({ date, status: "published" }).catch(() => []);
  if (items.length > 0) {
    return NextResponse.json({ ok: true, date, count: items.length });
  }
  await alertCron(
    "简报看门狗",
    `交易日 ${date} 到 08:30 仍无已发布简报 —— 主 cron(07:00)+ 补位(07:40)都没产出。请手动补:POST /api/briefing/generate?replace=1&llm=1(Bearer ADMIN_TOKEN)`
  );
  return NextResponse.json({ ok: true, date, alerted: true, count: 0 });
}
