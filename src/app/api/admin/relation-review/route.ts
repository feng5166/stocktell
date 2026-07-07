import { NextRequest, NextResponse } from "next/server";
import { isAdminAuthorized } from "@/lib/api-guard";
import { isAdminSession } from "@/lib/admin";
import { listReviewQueue, setReviewStatus, type ReviewStatus } from "@/lib/relation-review";

export const dynamic = "force-dynamic";

// 层③ reviewQueue 管理接口(仅 admin):GET 列表 / PATCH 审阅动作。
// 不变量#4:confirm 只是人工结论记录,改档仍走 chain-relations.ts 代码评审——本接口没有任何
// 写 staticRelations 的能力,这是设计而非疏漏。
export async function GET(req: NextRequest) {
  if (!isAdminAuthorized(req) && !(await isAdminSession())) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }
  const status = (req.nextUrl.searchParams.get("status") as ReviewStatus | null) ?? undefined;
  const items = await listReviewQueue(status);
  return NextResponse.json({ ok: true, items });
}

export async function PATCH(req: NextRequest) {
  if (!isAdminAuthorized(req) && !(await isAdminSession())) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }
  const body = (await req.json().catch(() => null)) as {
    id?: string;
    status?: ReviewStatus;
    note?: string;
  } | null;
  if (!body?.id || !["pending", "confirmed", "rejected"].includes(body.status ?? "")) {
    return NextResponse.json({ ok: false, error: "bad-request" }, { status: 400 });
  }
  const ok = await setReviewStatus(body.id, body.status!, body.note);
  return NextResponse.json({ ok }, { status: ok ? 200 : 500 });
}
