import { NextRequest, NextResponse } from "next/server";
import { isAdminAuthorized } from "@/lib/api-guard";
import { isAdminSession } from "@/lib/admin";
import { getPrisma } from "@/lib/prisma";
import { STOCK_MAP } from "@/data/stocks";
import { clawbot } from "@/lib/clawbot";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

async function guard(req: NextRequest): Promise<boolean> {
  return isAdminAuthorized(req) || (await isAdminSession());
}

// 池外票登记(2.3 P1-2)。GET=列表(含是否已入池/已兑现);POST=纳入兑现:
// 对「已入池且未兑现」的登记,给微信已绑定、且自选里有这只票的用户发一条
// 「你之前加的 XX 已纳入产业链图谱」——登记过的期待必须兑现(同时是留存钩子)。
// 触达边界(如实):webpush 订阅快照在订阅时按池白名单过滤,存不下池外码,无法定向;
// 邮件恢复后可并入次日个性化早报(自选个性化自动覆盖),故兑现通道 v1=微信定向。
export async function GET(req: NextRequest) {
  if (!(await guard(req)))
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  const db = getPrisma();
  if (!db) return NextResponse.json({ ok: false, error: "no-db" }, { status: 503 });
  const rows = await db.poolRequest.findMany({ orderBy: [{ count: "desc" }] }).catch(() => []);
  return NextResponse.json({
    ok: true,
    items: rows.map((r) => ({
      ...r,
      inPool: !!STOCK_MAP[r.code],
      name: STOCK_MAP[r.code]?.name ?? null,
    })),
  });
}

export async function POST(req: NextRequest) {
  if (!(await guard(req)))
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  const db = getPrisma();
  if (!db) return NextResponse.json({ ok: false, error: "no-db" }, { status: 503 });

  const pending = await db.poolRequest
    .findMany({ where: { notifiedAt: null } })
    .catch(() => []);
  const fulfilled = pending.filter((r) => STOCK_MAP[r.code]);
  if (fulfilled.length === 0)
    return NextResponse.json({ ok: true, notified: 0, note: "无「已入池待兑现」的登记" });

  const results: Record<string, { users: number; sent: number }> = {};
  for (const r of fulfilled) {
    const s = STOCK_MAP[r.code];
    // 定向:微信已绑定 且 自选里有这只票的用户
    const watchers = await db.watchlist
      .findMany({ where: { code: r.code }, select: { userId: true } })
      .catch(() => []);
    const users = watchers.length
      ? await db.user.findMany({
          where: { id: { in: watchers.map((w) => w.userId) }, weixinOpenId: { not: null } },
          select: { weixinOpenId: true },
        })
      : [];
    let sent = 0;
    for (const u of users) {
      const text =
        `📌 你之前加自选的 ${s.name}(${r.code})已纳入 StockTell 产业链图谱。\n` +
        `现在可以看到它的所属链、环节位置、关系档和验证点:\n` +
        `stocktell.me/stock/${r.code}\n` +
        `以上不构成投资建议`;
      const ok = await clawbot<{ ok?: boolean }>("/send", { openId: u.weixinOpenId, text });
      if (ok?.ok) sent++;
    }
    results[r.code] = { users: users.length, sent };
    await db.poolRequest
      .update({ where: { code: r.code }, data: { notifiedAt: new Date() } })
      .catch(() => null);
  }
  return NextResponse.json({ ok: true, notified: fulfilled.length, results });
}
