import { NextRequest, NextResponse } from "next/server";
import { listBriefing, type BriefingStatus } from "@/lib/briefings";
import { getBriefStatus } from "@/lib/brief-status";
import { getHolidayBridge } from "@/lib/holiday-bridge";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const date = req.nextUrl.searchParams.get("date") ?? undefined;
  const status =
    (req.nextUrl.searchParams.get("status") as BriefingStatus | null) ??
    undefined;
  try {
    // items 与 briefStatus 相互独立,并行读(review 小项④)
    const [items, briefStatus] = await Promise.all([
      listBriefing({ date, status }),
      // 指定日期时附上该日简报状态(2.1-A):历史简报的"当天为什么没有/是什么口径"从这里读,
      // generated/fallback/blocked/market_closed/failed 语义见 lib/brief-status.ts。
      date ? getBriefStatus(date).catch(() => null) : Promise.resolve(null),
    ]);
    // 节后首日观察(2.1-C)随状态归档:holiday_bridge 日的内容从这里可查,历史留档。
    const bridge =
      briefStatus?.subType === "holiday_bridge"
        ? await getHolidayBridge(date!).catch(() => null)
        : null;
    return NextResponse.json({
      ok: true,
      items,
      ...(date ? { briefStatus } : {}),
      ...(bridge ? { bridge } : {}),
    });
  } catch (e) {
    return NextResponse.json({ ok: false, error: String(e) }, { status: 500 });
  }
}
