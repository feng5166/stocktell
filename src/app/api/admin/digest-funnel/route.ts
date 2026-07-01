import { NextRequest, NextResponse } from "next/server";
import { isAdminAuthorized } from "@/lib/api-guard";
import { isAdminSession } from "@/lib/admin";
import { getPrisma } from "@/lib/prisma";
import { listBriefing } from "@/lib/briefings";
import { todayISO } from "@/lib/date";

export const dynamic = "force-dynamic";

// 只读:早报覆盖漏斗——注册 → 订阅 → 有自选 → 今天命中简报。解释"为何只有 N 人收到早报"。
export async function GET(req: NextRequest) {
  if (!isAdminAuthorized(req) && !(await isAdminSession())) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }
  const db = getPrisma();
  if (!db) return NextResponse.json({ ok: false, error: "no-db" }, { status: 500 });

  const date = todayISO();
  const totalUsers = await db.user.count();
  const subscribed = await db.user.findMany({
    where: { email: { not: null }, digestOptOut: false },
    select: { id: true },
  });
  const watches = await db.watchlist.findMany({ select: { userId: true, code: true } });
  const codesByUser = new Map<string, Set<string>>();
  for (const w of watches) {
    let s = codesByUser.get(w.userId);
    if (!s) {
      s = new Set();
      codesByUser.set(w.userId, s);
    }
    s.add(w.code);
  }

  const briefings = await listBriefing({ date, status: "published" });
  let subWithWatchlist = 0;
  let subWithRelevantToday = 0;
  for (const u of subscribed) {
    const codes = codesByUser.get(u.id);
    if (!codes || codes.size === 0) continue;
    subWithWatchlist++;
    const rel = briefings.some(
      (b) =>
        (b.triggerCode != null && codes.has(b.triggerCode)) ||
        b.beneficiaries.some((x) => codes.has(x.code))
    );
    if (rel) subWithRelevantToday++;
  }

  return NextResponse.json({
    date,
    briefingsToday: briefings.length,
    funnel: {
      totalUsers, // 注册总数
      subscribed: subscribed.length, // 有邮箱且未退订
      usersWithWatchlist: codesByUser.size, // 全体里有自选的(含未订阅)
      subscribedWithWatchlist: subWithWatchlist, // 订阅且有自选
      subscribedWithRelevantToday: subWithRelevantToday, // 订阅+有自选+今天命中(≈早报候选,另加雷区/资金面 alerts)
    },
  });
}
