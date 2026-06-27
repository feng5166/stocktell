import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { getOrCreateBindToken } from "@/lib/weixin-bind";
import { getPrisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }
  const db = getPrisma();
  const user = db
    ? await db.user.findUnique({
        where: { id: session.user.id },
        select: { weixinOpenId: true },
      })
    : null;
  if (user?.weixinOpenId) {
    return NextResponse.json({ ok: true, bound: true });
  }
  const token = await getOrCreateBindToken(session.user.id);
  return NextResponse.json({ ok: true, bound: false, token });
}
