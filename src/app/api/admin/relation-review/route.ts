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
  const r = await setReviewStatus(body.id, body.status!, body.note);
  if (r === "not-pending") {
    // W2(五轮 review):终态行拒绝二次写——RSC 陈旧刷新会把已决行短暂闪回列表,管理员补点
    // 另一个按钮不能把 confirmed 反向覆写成 rejected(需要改判走 DB/工单,保审计)。
    return NextResponse.json({ ok: false, error: "already-decided(该行已终审,拒绝覆写)" }, { status: 409 });
  }
  return NextResponse.json({ ok: r === "ok" }, { status: r === "ok" ? 200 : 500 });
}
