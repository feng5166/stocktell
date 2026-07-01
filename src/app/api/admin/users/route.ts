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
      digestOptOut: true,
      createdAt: true,
    },
    orderBy: { createdAt: "desc" },
    take: 1000,
  });

  // 每个用户的自选数量(识别"注册了但没加票"的用户)
  const wl = await db.watchlist.groupBy({ by: ["userId"], _count: { code: true } });
  const wlCount = new Map(wl.map((w) => [w.userId, w._count.code]));

  const list = users.map((u) => ({
    id: u.id,
    email: u.email,
    nickname: u.nickname,
    createdAt: u.createdAt,
    weixinBound: !!u.weixinOpenId,
    openId: u.weixinOpenId,
    digestOptOut: u.digestOptOut, // 已退订每日邮件
    watchlistCount: wlCount.get(u.id) ?? 0, // 自选数量
  }));

  return NextResponse.json({
    ok: true,
    total: list.length,
    bound: list.filter((u) => u.weixinBound).length,
    withEmail: list.filter((u) => !!u.email).length,
    withWatchlist: list.filter((u) => u.watchlistCount > 0).length,
    subscribed: list.filter((u) => !!u.email && !u.digestOptOut).length,
    users: list,
  });
}
