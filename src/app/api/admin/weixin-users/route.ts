import { NextRequest, NextResponse } from "next/server";
import { isAdminAuthorized } from "@/lib/api-guard";
import { isAdminSession } from "@/lib/admin";
import { getPrisma } from "@/lib/prisma";
import { clawbot } from "@/lib/clawbot";

export const dynamic = "force-dynamic";

// 管理后台:列出已绑微信的用户(DB)+ 合并桥侧窗口信息
export async function GET(req: NextRequest) {
  if (!isAdminAuthorized(req) && !(await isAdminSession())) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }
  const db = getPrisma();
  if (!db) return NextResponse.json({ ok: true, users: [], pending: [], stats: { bound: 0, pending: 0 } });

  const users = await db.user.findMany({
    where: { weixinOpenId: { not: null } },
    select: { id: true, email: true, nickname: true, weixinOpenId: true, createdAt: true },
    orderBy: { createdAt: "desc" },
  });

  // 扫了码但还没发消息激活的用户(weixinOpenId 仍空但有扫码时间戳)。这些人收不到推送,值得运营盯。
  const pendingUsers = await db.user.findMany({
    where: { weixinOpenId: null, weixinPendingScanAt: { not: null } },
    select: { id: true, email: true, nickname: true, weixinPendingScanAt: true },
    orderBy: { weixinPendingScanAt: "desc" },
  });
  const pending = pendingUsers.map((u) => ({
    id: u.id,
    email: u.email,
    nickname: u.nickname,
    scanAt: u.weixinPendingScanAt,
  }));

  // 桥侧窗口/活跃信息
  interface BridgeUser {
    openId: string;
    accountId: string;
    boundAt: number;
    lastMsgAt: number | null;
    active: boolean;
    windowSec: number | null;
    failCount?: number;
    lastError?: { ret: number | null; http: number | null; at: number } | null;
    lastSendOkAt?: number | null;
  }
  const bridge = await clawbot<{ ok: boolean; users: BridgeUser[] }>("/users", null, "GET");
  const byOpen = new Map<string, BridgeUser>((bridge?.users || []).map((u) => [u.openId, u]));

  const list = users.map((u) => {
    const b = u.weixinOpenId ? byOpen.get(u.weixinOpenId) : null;
    return {
      id: u.id,
      email: u.email,
      nickname: u.nickname,
      openId: u.weixinOpenId,
      createdAt: u.createdAt,
      // 桥侧:active=已抓到 ctoken;windowSec=距上次发消息秒数(>86400 即超 24h 窗口,推不进)
      active: b?.active ?? null,
      lastMsgAt: b?.lastMsgAt ?? null,
      windowSec: b?.windowSec ?? null,
      inWindow: b?.windowSec != null ? b.windowSec < 86400 : null,
      failCount: b?.failCount ?? 0,
      lastError: b?.lastError ?? null,
      // 桥侧若已判定失效会自动清除,故出现在此列表=DB有记录但桥已无 → 视为可能失效
      bridgeMissing: !b,
    };
  });
  // 超 24h 窗口 = 已绑但 inWindow===false(微信推不进,需用户重新给 bot 发消息激活窗口)
  const outWindow = list.filter((u) => u.inWindow === false).length;
  return NextResponse.json({
    ok: true,
    users: list,
    pending,
    stats: { bound: list.length, pending: pending.length, outWindow },
  });
}
