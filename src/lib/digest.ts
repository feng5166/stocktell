// 盘前推送:给有自选、且今天有相关简报的登录用户,发一封"你的票今天有 N 条相关动态"。
// 只在有相关动态时发(不骚扰"今天没事");跟密码重置一样,Resend 没配就降级打印,不报错。
import { Resend } from "resend";
import { getPrisma } from "@/lib/prisma";
import { listBriefing, type BriefingItem } from "@/lib/briefings";

function todayISO(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

async function sendDigest(
  to: string,
  nickname: string | null,
  date: string,
  items: BriefingItem[]
): Promise<boolean> {
  const base = process.env.NEXTAUTH_URL || "https://stocktell.vercel.app";
  const rows = items.map((it) => {
    const benes = it.beneficiaries.map((b) => b.name).join("、");
    return { impact: it.impact, title: it.title, benes };
  });
  const text =
    `${nickname || "你好"},\n${date} 你的自选今天有 ${items.length} 条相关动态:\n\n` +
    rows.map((r) => `· [${r.impact}] ${r.title}${r.benes ? ` — 受益:${r.benes}` : ""}`).join("\n") +
    `\n\n打开看详情:${base}\n\n以上为信息整理,不构成投资建议。`;
  const html = `<div style="font-family:sans-serif;max-width:520px;margin:0 auto;color:#1a1d24">
    <h2 style="font-size:16px">你的自选今天有 ${items.length} 条相关动态</h2>
    <p style="color:#888;font-size:12px;margin:0 0 12px">${date} · StockTell 盘前提醒</p>
    ${rows
      .map(
        (r) => `<div style="border:1px solid #eee;border-radius:10px;padding:10px 12px;margin-bottom:8px">
        <div style="font-size:12px;color:#888">${r.impact}影响</div>
        <div style="font-weight:600">${r.title}</div>
        ${r.benes ? `<div style="font-size:12px;color:#555;margin-top:4px">受益:${r.benes}</div>` : ""}
      </div>`
      )
      .join("")}
    <p><a href="${base}" style="display:inline-block;background:#111;color:#fff;padding:9px 18px;border-radius:8px;text-decoration:none;font-size:13px">打开 StockTell 看详情</a></p>
    <p style="color:#aaa;font-size:11px">以上为信息整理,不构成投资建议。历史规律不代表未来表现。</p>
  </div>`;

  if (!process.env.RESEND_API_KEY) {
    console.log(`[digest 降级] → ${to}:${items.length} 条相关动态`);
    return false;
  }
  const resend = new Resend(process.env.RESEND_API_KEY);
  const from = process.env.EMAIL_FROM || "StockTell <onboarding@resend.dev>";
  const { error } = await resend.emails.send({
    from,
    to: [to],
    subject: `你的自选今天有 ${items.length} 条相关动态 · StockTell`,
    text,
    html,
  });
  if (error) {
    console.error("[digest] resend error:", error);
    return false;
  }
  return true;
}

export async function runPreOpenDigest(): Promise<{
  ok: boolean;
  skipped?: string;
  date?: string;
  candidates: number; // 有相关动态、该收到的用户数
  sent: number; // 实际发出数(Resend 没配时为 0)
}> {
  const db = getPrisma();
  if (!db) return { ok: true, skipped: "no-db", candidates: 0, sent: 0 };

  const date = todayISO();
  const briefings = await listBriefing({ date, status: "published" });
  if (briefings.length === 0)
    return { ok: true, skipped: "no-briefing", candidates: 0, sent: 0 };

  const users = await db.user.findMany({
    where: { email: { not: null } },
    select: { id: true, email: true, nickname: true },
  });
  const watches = await db.watchlist.findMany({
    select: { userId: true, code: true },
  });
  const codesByUser = new Map<string, Set<string>>();
  for (const w of watches) {
    let set = codesByUser.get(w.userId);
    if (!set) {
      set = new Set();
      codesByUser.set(w.userId, set);
    }
    set.add(w.code);
  }

  let candidates = 0;
  let sent = 0;
  for (const u of users) {
    if (!u.email) continue;
    const codes = codesByUser.get(u.id);
    if (!codes || codes.size === 0) continue;
    const relevant = briefings.filter(
      (b) =>
        (b.triggerCode != null && codes.has(b.triggerCode)) ||
        b.beneficiaries.some((x) => codes.has(x.code))
    );
    if (relevant.length === 0) continue; // 没相关动态就不发,不骚扰
    candidates++;
    if (await sendDigest(u.email, u.nickname, date, relevant)) sent++;
  }
  return { ok: true, date, candidates, sent };
}
