import { NextRequest, NextResponse } from "next/server";
import { isAdminAuthorized } from "@/lib/api-guard";
import { isAdminSession } from "@/lib/admin";
import { runNetProbe } from "@/lib/net-probe";

export const dynamic = "force-dynamic";
export const maxDuration = 60;
export const preferredRegion = "iad1"; // 美东(临时:测美国区打阿里云北京的速度,测完删)

export async function GET(req: NextRequest) {
  if (!isAdminAuthorized(req) && !(await isAdminSession())) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }
  return NextResponse.json({ ok: true, ...(await runNetProbe()) });
}
