import { NextRequest, NextResponse } from "next/server";
import { listBriefing, type BriefingStatus } from "@/lib/briefings";
import { getBriefStatus } from "@/lib/brief-status";
import { getHolidayBridge } from "@/lib/holiday-bridge";
import { isAdminAuthorized } from "@/lib/api-guard";
import { isAdminSession } from "@/lib/admin";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const date = req.nextUrl.searchParams.get("date") ?? undefined;
  // draft 是未过人审的 AI 内容(合规面敞口,铁律2),公开读一律锁死 published;
  // 只有管理员(session 或 ADMIN_TOKEN)能读全量/草稿 —— /admin/briefing 审稿台依赖不带
  // status 参数返回含 draft 的全量,故 admin 侧保留原语义(2026-07-30 review)。
  const admin = isAdminAuthorized(req) || (await isAdminSession());
  const rawStatus = req.nextUrl.searchParams.get("status");
  const status: BriefingStatus | undefined = admin
    ? rawStatus === "draft" || rawStatus === "published"
      ? rawStatus
      : undefined
    : "published";
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
