import { NextRequest, NextResponse } from "next/server";
import { recordOutcomes } from "@/lib/outcomes";
import { isAdminAuthorized } from "@/lib/api-guard";
import { isAdminSession } from "@/lib/admin";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// 补录某个历史交易日的战绩(查账)。用于漏记的日子:
// 当天 15:30 记账 cron 没跑到(如简报当天没按时发布),事后简报补全了再用这个补录。
// 关键:用 Tushare 当日收盘(historical=true)取价,而非实时行情——过了那天实时行情取不到当天收盘。
// 用法:GET /api/admin/backfill-outcomes?date=YYYY-MM-DD  (Authorization: Bearer ADMIN_TOKEN)
export async function GET(req: NextRequest) {
  if (!isAdminAuthorized(req) && !(await isAdminSession())) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }
  const date = req.nextUrl.searchParams.get("date");
  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return NextResponse.json(
      { ok: false, error: "date 必填,格式 YYYY-MM-DD" },
      { status: 400 }
    );
  }
  try {
    const res = await recordOutcomes(date, { historical: true });
    // M3(2.3 P1-1):补录后同步重算历史同向聚合快照(与 outcome cron 同款;失败不连累补录)
    const { writeOutcomeAgg } = await import("@/lib/outcome-agg");
    const agg = await writeOutcomeAgg().catch(() => null);
    return NextResponse.json({ date, ...res, agg });
  } catch (e) {
    return NextResponse.json({ ok: false, error: String(e) }, { status: 500 });
  }
}
