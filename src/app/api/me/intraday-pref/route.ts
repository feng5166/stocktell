import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { getPrisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

// 登录用户读写"盘中异动提醒"偏好(intraday_opt_out 反向 = enabled)。
// 仅对已绑微信用户有意义,故同时返回 bound。
export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }
  const db = getPrisma();
  if (!db) return NextResponse.json({ ok: true, enabled: true, bound: false });
  const u = await db.user.findUnique({
    where: { id: session.user.id },
    select: { intradayOptOut: true, weixinOpenId: true },
  });
  return NextResponse.json({
    ok: true,
    enabled: !(u?.intradayOptOut ?? false),
    bound: !!u?.weixinOpenId,
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
    data: { intradayOptOut: !enabled },
  });
  return NextResponse.json({ ok: true, enabled });
}
