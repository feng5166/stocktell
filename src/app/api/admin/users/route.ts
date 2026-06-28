import { NextRequest, NextResponse } from "next/server";
import { isAdminAuthorized } from "@/lib/api-guard";
import { isAdminSession } from "@/lib/admin";
import { getPrisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

// 管理后台:列出全部网站用户(含是否绑定微信)。管理员登录即可(ADMIN_TOKEN 仍兼容)。
export async function GET(req: NextRequest) {
  if (!isAdminAuthorized(req) && !(await isAdminSession())) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }
  const db = getPrisma();
  if (!db) return NextResponse.json({ ok: true, users: [], total: 0, bound: 0 });

  const users = await db.user.findMany({
    select: {
      id: true,
      email: true,
      nickname: true,
      weixinOpenId: true,
      createdAt: true,
    },
    orderBy: { createdAt: "desc" },
    take: 1000,
  });

  const list = users.map((u) => ({
    id: u.id,
    email: u.email,
    nickname: u.nickname,
    createdAt: u.createdAt,
    weixinBound: !!u.weixinOpenId,
    openId: u.weixinOpenId,
  }));

  return NextResponse.json({
    ok: true,
    total: list.length,
    bound: list.filter((u) => u.weixinBound).length,
    users: list,
  });
}
