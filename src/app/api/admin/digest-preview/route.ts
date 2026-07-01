import { NextRequest, NextResponse } from "next/server";
import { isAdminAuthorized } from "@/lib/api-guard";
import { isAdminSession } from "@/lib/admin";
import { getPrisma } from "@/lib/prisma";
import { sendDigestToUser } from "@/lib/digest";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// 后台:给指定用户发一封真·盘前早报(富文本 digest,复用线上同款模板),用于预览确认格式。
// body: { userId?: string, email?: string }  —— 二选一;只发这一个人,不影响其它用户。
export async function POST(req: NextRequest) {
  if (!isAdminAuthorized(req) && !(await isAdminSession())) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }
  const body = await req.json().catch(() => ({}));
  let userId: string | undefined = body.userId;
  const email: string | undefined = body.email;

  if (!userId && email) {
    const db = getPrisma();
    if (!db) return NextResponse.json({ ok: false, error: "no-db" }, { status: 500 });
    const u = await db.user.findFirst({
      where: { email },
      select: { id: true },
    });
    if (!u) return NextResponse.json({ ok: false, error: "user-not-found" }, { status: 404 });
    userId = u.id;
  }
  if (!userId) {
    return NextResponse.json({ ok: false, error: "missing userId or email" }, { status: 400 });
  }

  const res = await sendDigestToUser(userId);
  return NextResponse.json(res);
}
