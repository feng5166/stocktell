import { NextRequest, NextResponse } from "next/server";
import { isAdminAuthorized } from "@/lib/api-guard";
import { isAdminSession } from "@/lib/admin";
import { getPrisma } from "@/lib/prisma";
import { sendMail } from "@/lib/mailer";
import { unsubFooter } from "@/lib/unsub";

export const dynamic = "force-dynamic";

function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

// 管理后台:手动给用户发邮件。body: { userIds?: string[], all?: boolean, subject, text }
// all=true 时只发给"未退订每日邮件"的用户(尊重退订);显式选 userIds 则按管理员选择发。
export async function POST(req: NextRequest) {
  if (!isAdminAuthorized(req) && !(await isAdminSession())) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }
  const { userIds, all, subject, text } = await req.json();
  if (!subject || typeof subject !== "string") {
    return NextResponse.json({ ok: false, error: "missing_subject" }, { status: 400 });
  }
  if (!text || typeof text !== "string") {
    return NextResponse.json({ ok: false, error: "missing_text" }, { status: 400 });
  }
  const db = getPrisma();
  if (!db) return NextResponse.json({ ok: false, error: "no-db" }, { status: 500 });

  let targets: { id: string; email: string }[] = [];
  if (all) {
    const users = await db.user.findMany({
      where: { email: { not: null }, digestOptOut: false },
      select: { id: true, email: true },
    });
    targets = users
      .filter((u) => u.email)
      .map((u) => ({ id: u.id, email: u.email! }));
  } else if (Array.isArray(userIds) && userIds.length > 0) {
    const users = await db.user.findMany({
      where: { id: { in: userIds }, email: { not: null } },
      select: { id: true, email: true },
    });
    targets = users
      .filter((u) => u.email)
      .map((u) => ({ id: u.id, email: u.email! }));
  }
  if (targets.length === 0) {
    return NextResponse.json({ ok: false, error: "no_targets" }, { status: 400 });
  }

  const base = process.env.NEXTAUTH_URL || "https://stocktell.me";
  const bodyHtml = esc(text).replace(/\n/g, "<br>");

  const results: { id: string; ok: boolean }[] = [];
  for (const u of targets) {
    const unsub = unsubFooter(base, u.id);
    const html = `<div style="font-family:sans-serif;max-width:520px;margin:0 auto;color:#1a1d24">
      <p style="color:#888;font-size:12px;margin:0 0 12px">StockTell</p>
      <div style="font-size:14px;line-height:1.75">${bodyHtml}</div>
      ${unsub.html}
    </div>`;
    const ok = await sendMail({
      to: u.email,
      subject,
      text: `${text}${unsub.text}`,
      html,
      headers: unsub.headers,
    });
    results.push({ id: u.id, ok });
  }
  const sent = results.filter((r) => r.ok).length;
  return NextResponse.json({ ok: true, sent, total: targets.length });
}
