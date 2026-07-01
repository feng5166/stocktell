import { NextRequest, NextResponse } from "next/server";
import { isAdminAuthorized } from "@/lib/api-guard";
import { isAdminSession } from "@/lib/admin";
import { runNetProbe } from "@/lib/net-probe";

export const dynamic = "force-dynamic";
export const maxDuration = 60;
// 区域由 vercel.json(hnd1)控制;此探针保留,跑在默认区。

export async function GET(req: NextRequest) {
  if (!isAdminAuthorized(req) && !(await isAdminSession())) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }
  return NextResponse.json({ ok: true, ...(await runNetProbe()) });
}
