import { getPrisma } from "@/lib/prisma";
import { listBriefing, type BriefingItem } from "@/lib/briefings";
import { todayISO } from "@/lib/date";

const DOT: Record<string, string> = { 高: "🔴", 中: "🟡", 低: "🟢" };

function formatMessage(date: string, items: BriefingItem[]): string {
  const lines = [`📊 StockTell · ${date} 盘前提醒`, ""];
  lines.push(`你的自选今天有 ${items.length} 条相关动态:`, "");
  for (const it of items) {
    lines.push(`${DOT[it.impact] ?? ""} ${it.title}`);
    if (it.beneficiaries.length) {
      lines.push(`   → ${it.beneficiaries.map((b) => b.name).join(" · ")}`);
    }
    lines.push("");
  }
  lines.push("stocktell.me 看完整简报");
  lines.push("以上不构成投资建议");
  return lines.join("\n");
}

async function sendToClawBot(openId: string, text: string): Promise<boolean> {
  const apiUrl = process.env.CLAWBOT_API_URL;
  const secret = process.env.CLAWBOT_SECRET;
  if (!apiUrl) {
    console.log(`[push-weixin 降级] → ${openId}: ${text.slice(0, 50)}...`);
    return false;
  }
  try {
    const res = await fetch(apiUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(secret ? { "x-clawbot-secret": secret } : {}),
      },
      body: JSON.stringify({ openId, text }),
    });
    return res.ok;
  } catch (e) {
    console.error("[push-weixin] error:", e);
    return false;
  }
}

export async function runWeixinPush(): Promise<{
  ok: boolean;
  skipped?: string;
  date?: string;
  candidates: number;
  sent: number;
}> {
  const db = getPrisma();
  if (!db) return { ok: true, skipped: "no-db", candidates: 0, sent: 0 };

  const date = todayISO();
  const briefings = await listBriefing({ date, status: "published" });
  if (briefings.length === 0)
    return { ok: true, skipped: "no-briefing", candidates: 0, sent: 0 };

  const users = await db.user.findMany({
    where: { weixinOpenId: { not: null } },
    select: { id: true, weixinOpenId: true },
  });
  if (users.length === 0)
    return { ok: true, skipped: "no-weixin-users", candidates: 0, sent: 0 };

  const watches = await db.watchlist.findMany({
    where: { userId: { in: users.map((u) => u.id) } },
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
    if (!u.weixinOpenId) continue;
    const codes = codesByUser.get(u.id);
    if (!codes || codes.size === 0) continue;

    const relevant = briefings.filter(
      (b) =>
        (b.triggerCode != null && codes.has(b.triggerCode)) ||
        b.beneficiaries.some((x) => codes.has(x.code))
    );
    if (relevant.length === 0) continue;

    candidates++;
    const text = formatMessage(date, relevant);
    if (await sendToClawBot(u.weixinOpenId, text)) sent++;
  }

  return { ok: true, date, candidates, sent };
}
