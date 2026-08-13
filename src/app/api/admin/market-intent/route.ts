// Market Intent 快照只读查看(admin):最近一日全板块判定,或 ?ymd= 指定日。
// 用途:上线初期人工校验判定质量(本地无产线库直连,经此端点看产线快照);2.2.3 前台接入后仍留作调试面。
import { NextRequest, NextResponse } from "next/server";
import { isAdminAuthorized } from "@/lib/api-guard";
import { latestSnapshots, snapshotsByYmd } from "@/lib/market-intent/store";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  if (!isAdminAuthorized(req)) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }
  const ymd = req.nextUrl.searchParams.get("ymd");
  if (ymd) {
    return NextResponse.json({ ok: true, ymd, snaps: await snapshotsByYmd(ymd) });
  }
  const latest = await latestSnapshots();
  return NextResponse.json({ ok: true, ...latest });
}
