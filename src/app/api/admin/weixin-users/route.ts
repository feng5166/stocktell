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
  if (!db) return NextResponse.json({ ok: true, users: [] });

  const users = await db.user.findMany({
    where: { weixinOpenId: { not: null } },
    select: { id: true, email: true, nickname: true, weixinOpenId: true, createdAt: true },
    orderBy: { createdAt: "desc" },
  });

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
  return NextResponse.json({ ok: true, users: list });
}
