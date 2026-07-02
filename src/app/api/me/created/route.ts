import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { getPrisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

// 判定当前登录用户是否"刚注册"(createdAt 在 2 分钟内)。供 AuthTracker 在 OAuth 回来后
// 区分 signup vs login(覆盖 Google——它整页跳转、无法内联埋点)。只读、不改任何数据。
export async function GET() {
  const session = await getServerSession(authOptions).catch(() => null);
  const id = session?.user?.id;
  if (!id) return NextResponse.json({ isNew: false });
  const db = getPrisma();
  const u = db
    ? await db.user.findUnique({ where: { id }, select: { createdAt: true } }).catch(() => null)
    : null;
  const isNew = !!(u && Date.now() - new Date(u.createdAt).getTime() < 120_000);
  return NextResponse.json({ isNew });
}
