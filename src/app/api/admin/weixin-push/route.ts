import { NextRequest, NextResponse } from "next/server";
import { isAdminAuthorized } from "@/lib/api-guard";
import { isAdminSession } from "@/lib/admin";
import { getPrisma } from "@/lib/prisma";
import { clawbot } from "@/lib/clawbot";

export const dynamic = "force-dynamic";

// 管理后台:手动给指定用户推送。body: { openIds?: string[], all?: boolean, text }
export async function POST(req: NextRequest) {
  if (!isAdminAuthorized(req) && !(await isAdminSession())) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }
  const { openIds, all, text } = await req.json();
  if (!text || typeof text !== "string") {
    return NextResponse.json({ ok: false, error: "missing_text" }, { status: 400 });
  }

  let targets: string[] = Array.isArray(openIds) ? openIds : [];
  if (all) {
    const db = getPrisma();
    if (db) {
      const users = await db.user.findMany({
        where: { weixinOpenId: { not: null } },
        select: { weixinOpenId: true },
      });
      targets = users.map((u) => u.weixinOpenId!).filter(Boolean);
    }
  }
  if (targets.length === 0) {
    return NextResponse.json({ ok: false, error: "no_targets" }, { status: 400 });
  }

  const results = [];
  for (const openId of targets) {
    const r = await clawbot<{ ok: boolean }>("/send", { openId, text });
    results.push({ openId, ok: !!r?.ok });
  }
  const sent = results.filter((r) => r.ok).length;
  return NextResponse.json({ ok: true, sent, total: targets.length, results });
}
