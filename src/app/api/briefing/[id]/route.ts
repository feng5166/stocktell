import { NextRequest, NextResponse } from "next/server";
import { updateBriefing, deleteBriefing } from "@/lib/briefings";
import { isAdminAuthorized } from "@/lib/api-guard";
import { isAdminSession } from "@/lib/admin";

export const dynamic = "force-dynamic";

// 改写/删除简报是管理操作:必须管理员鉴权(token 或管理员会话)。
// 此前零鉴权 → 任何人知道 id 即可删改任意简报(数据完整性 + 内容合规事故面)。
async function requireAdmin(req: NextRequest): Promise<boolean> {
  return isAdminAuthorized(req) || (await isAdminSession());
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  if (!(await requireAdmin(req)))
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  try {
    const patch = await req.json();
    await updateBriefing(params.id, patch);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ ok: false, error: String(e) }, { status: 500 });
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  if (!(await requireAdmin(req)))
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  try {
    await deleteBriefing(params.id);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ ok: false, error: String(e) }, { status: 500 });
  }
}
