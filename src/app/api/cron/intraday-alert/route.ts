import { NextRequest, NextResponse } from "next/server";
import { runIntradayAlert } from "@/lib/intraday-alert";
import { isCronAuthorized } from "@/lib/api-guard";
import { alertCron } from "@/lib/monitor";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// 盘中异动补推。由 GitHub Actions 每 10 分钟触发(绕开 Vercel cron 频率限制);
// 端点内自行卡交易日 + 交易时段,非时段直接 off-hours 跳过(便宜)。
export async function GET(req: NextRequest) {
  if (!isCronAuthorized(req)) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }
  try {
    const r = await runIntradayAlert();
    return NextResponse.json(r);
  } catch (e) {
    await alertCron("intraday-alert(盘中异动)", e);
    return NextResponse.json({ ok: false, error: String(e) }, { status: 500 });
  }
}
