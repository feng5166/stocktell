import { NextRequest, NextResponse } from "next/server";
import { ingestRows, type BacktestRow } from "@/lib/backtest";
import { isAdminAuthorized } from "@/lib/api-guard";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// 回测落库(在 Vercel 上跑,DB 可达)。需 Authorization: Bearer ADMIN_TOKEN。
// body: { rows: BacktestRow[] }(由 /api/admin/backtest?dry=1 在住宅 IP 算好后 POST 过来)。
export async function POST(req: NextRequest) {
  if (!isAdminAuthorized(req)) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }
  try {
    const body = await req.json().catch(() => ({}));
    const rows: BacktestRow[] = Array.isArray(body.rows) ? body.rows : [];
    const written = await ingestRows(rows);
    return NextResponse.json({ ok: true, received: rows.length, written });
  } catch (e) {
    return NextResponse.json({ ok: false, error: String(e) }, { status: 500 });
  }
}
