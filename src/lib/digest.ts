// 盘前推送:给有自选、且今天有相关简报的登录用户,发一封个性化早报。
// 顶部是 LLM 综合的一段「你的票今天该看什么」,下面附相关动态列表。
// 只在有相关动态时发(不骚扰"今天没事");Resend 没配就降级打印,不报错。
import { getPrisma } from "@/lib/prisma";
import { listBriefing, type BriefingItem } from "@/lib/briefings";
import { todayISO } from "@/lib/date";
import { sendMail } from "@/lib/mailer";
import { getMorningBrief } from "@/lib/morning-brief";

async function sendDigest(
  to: string,
  date: string,
  items: BriefingItem[],
  brief: string
): Promise<boolean> {
  const base = process.env.NEXTAUTH_URL || "https://stocktell.vercel.app";
  const rows = items.map((it) => {
    const benes = it.beneficiaries.map((b) => b.name).join("、");
    return { impact: it.impact, title: it.title, benes };
  });
  const text =
    `${brief}\n\n—— 相关动态 ——\n` +
    rows
      .map((r) => `· [${r.impact}] ${r.title}${r.benes ? ` — 受益:${r.benes}` : ""}`)
      .join("\n") +
    `\n\n打开看详情:${base}\n\n以上为信息整理,不构成投资建议。`;
  const html = `<div style="font-family:sans-serif;max-width:520px;margin:0 auto;color:#1a1d24">
    <p style="color:#888;font-size:12px;margin:0 0 6px">${date} · StockTell 盘前早报</p>
    <p style="font-size:14px;line-height:1.75;background:#fffef6;border:1px solid #f0e9c8;border-radius:10px;padding:12px 14px;margin:0 0 14px">${brief}</p>
    <div style="font-size:13px;color:#666;margin:0 0 8px">相关动态</div>
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

  return sendMail({
    to,
    subject: `你的自选今天有 ${items.length} 条相关动态 · StockTell`,
    text,
    html,
  });
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
    const brief = await getMorningBrief(Array.from(codes), relevant);
    if (await sendDigest(u.email, date, relevant, brief)) sent++;
  }
  return { ok: true, date, candidates, sent };
}
