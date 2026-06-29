import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { getPrisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

// 登录用户读写"每日邮件推送"偏好(digest_opt_out 反向 = enabled)。
export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }
  const db = getPrisma();
  if (!db) return NextResponse.json({ ok: true, enabled: true });
  const u = await db.user.findUnique({
    where: { id: session.user.id },
    select: { digestOptOut: true, email: true },
  });
  return NextResponse.json({
    ok: true,
    enabled: !(u?.digestOptOut ?? false),
    hasEmail: !!u?.email,
  });
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }
  const db = getPrisma();
  if (!db) return NextResponse.json({ ok: false, error: "no-db" }, { status: 500 });
  const body = await req.json().catch(() => ({}));
  const enabled = !!body.enabled;
  await db.user.update({
    where: { id: session.user.id },
    data: { digestOptOut: !enabled },
  });
  return NextResponse.json({ ok: true, enabled });
}
