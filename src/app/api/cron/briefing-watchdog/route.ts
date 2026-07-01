import { NextRequest, NextResponse } from "next/server";
import { listBriefing } from "@/lib/briefings";
import { todayISO } from "@/lib/date";
import { isAshareTradingDay } from "@/lib/tushare";
import { isCronAuthorized } from "@/lib/api-guard";
import { alertCron } from "@/lib/monitor";
import { sendFeishu } from "@/lib/feishu";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

// 简报状态日报 / 看门狗:08:30 北京(主 07:00 + 补位 07:40 都尘埃落定后),
// 每个交易日核对当天简报,成功 ✅ / 失败 ❌ 都推飞书,把"静默漏一整天"变成"每早可感知"。
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
    // 成功:推一条确认(主/补位 cron 正常跑通)
    const fs = await sendFeishu(
      `✅ StockTell 今日简报已就绪 · ${date} · 共 ${items.length} 条(主/补位 cron 正常)`
    );
    return NextResponse.json({ ok: true, date, count: items.length, feishu: fs });
  }
  // 失败:主 + 补位都没产出 → 告警让人工补
  const fs = await sendFeishu(
    `❌ StockTell 今日简报缺失 · ${date} · 到 08:30 仍 0 条(主 07:00 + 补位 07:40 都没出)。请手动补:POST /api/briefing/generate?replace=1&llm=1(Bearer ADMIN_TOKEN)`
  );
  await alertCron("简报看门狗", `交易日 ${date} 到 08:30 仍无已发布简报,需手动补`);
  return NextResponse.json({ ok: true, date, alerted: true, count: 0, feishu: fs });
}
