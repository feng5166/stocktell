import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { getPrisma } from "@/lib/prisma";
import { clawbot } from "@/lib/clawbot";

export const dynamic = "force-dynamic";

// 登录用户点「开启微信推送」:已绑则返回 bound;否则向桥申请一个绑定二维码(归属本账号)
export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }
  const db = getPrisma();
  const user = db
    ? await db.user.findUnique({ where: { id: session.user.id }, select: { weixinOpenId: true } })
    : null;
  if (user?.weixinOpenId) {
    return NextResponse.json({ ok: true, bound: true });
  }
  const r = await clawbot<{ ok: boolean; qrcode: string; qrImg: string }>("/bind/start", {
    accountId: session.user.id,
  });
  if (!r?.ok) {
    return NextResponse.json({ ok: false, error: "bridge_unavailable" }, { status: 502 });
  }
  return NextResponse.json({ ok: true, bound: false, qrcode: r.qrcode, qrImg: r.qrImg });
}
