import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { getPrisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

// 轻量绑定状态(无副作用,给站内提醒 banner 用):
// bound=已绑;pendingActivation=扫了码但还没发消息激活(还差一步)。
export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }
  const db = getPrisma();
  if (!db) return NextResponse.json({ ok: true, bound: false, pendingActivation: false });

  const user = await db.user.findUnique({
    where: { id: session.user.id },
    select: { weixinOpenId: true, weixinPendingScanAt: true },
  });
  const bound = !!user?.weixinOpenId;
  return NextResponse.json({
    ok: true,
    bound,
    pendingActivation: !bound && !!user?.weixinPendingScanAt,
  });
}
