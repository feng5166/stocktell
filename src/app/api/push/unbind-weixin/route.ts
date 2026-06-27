import { NextRequest, NextResponse } from "next/server";
import { getPrisma } from "@/lib/prisma";
import { unbindWeixin } from "@/lib/weixin-bind";

export const dynamic = "force-dynamic";

// 网站端:登录用户解绑自己
export async function DELETE() {
  const { getServerSession } = await import("next-auth");
  const { authOptions } = await import("@/lib/auth");
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }
  await unbindWeixin(session.user.id);
  return NextResponse.json({ ok: true });
}

// ClawBot 端:通过 openId 解绑
export async function POST(req: NextRequest) {
  const secret = process.env.CLAWBOT_SECRET;
  if (secret && req.headers.get("x-clawbot-secret") !== secret) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }
  const { openId } = await req.json();
  if (!openId) return NextResponse.json({ ok: false, error: "missing openId" }, { status: 400 });

  const db = getPrisma()!;
  await db.user.updateMany({
    where: { weixinOpenId: openId },
    data: { weixinOpenId: null },
  });
  return NextResponse.json({
    ok: true,
    replyText: "已取消每日推送。随时回来发绑定码可以重新开启。",
  });
}
