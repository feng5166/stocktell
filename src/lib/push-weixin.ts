import { getPrisma } from "@/lib/prisma";
import { listBriefing, type BriefingItem } from "@/lib/briefings";
import { todayISO } from "@/lib/date";
import { getMorningBrief } from "@/lib/morning-brief";
import { clawbot } from "@/lib/clawbot";
import { fundFlowFor, type FundFlowItem } from "@/lib/fund-flow";
import { pickFundAlerts, fundAlertLine } from "@/lib/digest";

const DOT: Record<string, string> = { 高: "🔴", 中: "🟡", 低: "🟢" };

// 相关简报版:与邮件 sendDigest 内容一致(个性化早报 + 相关动态列表)
function formatBriefMessage(date: string, items: BriefingItem[], brief: string): string {
  const lines = [`📊 StockTell · ${date} 盘前早报`, "", brief, "", "—— 相关动态 ——", ""];
  for (const it of items) {
    lines.push(`${DOT[it.impact] ?? ""} ${it.title}`);
    if (it.beneficiaries.length) {
      lines.push(`   → ${it.beneficiaries.map((b) => b.name).join(" · ")}`);
    }
    lines.push("");
  }
  lines.push("stocktell.me/#mine 看完整简报");
  lines.push("以上不构成投资建议");
  return lines.join("\n");
}

// 资金面异动版:与邮件 sendFundDigest 内容一致(无相关简报、但自选资金面有异动时)
function formatFundMessage(date: string | null, alerts: FundFlowItem[]): string {
  const lines = [
    `💰 StockTell 盘前提醒${date ? ` · 资金面截至 ${date}` : ""}`,
    "",
    "今天没有跟你的票相关的隔夜美股动态,但你的自选资金面有异动:",
    "",
  ];
  for (const it of alerts) lines.push(`· ${fundAlertLine(it)}`);
  lines.push("", "stocktell.me/#mine 看详情", "以上不构成投资建议");
  return lines.join("\n");
}

// 经自托管桥 /send 发送。统一走 clawbot 助手(CLAWBOT_BASE_URL + CLAWBOT_SECRET 一处配置)。
async function sendToBridge(openId: string, text: string): Promise<boolean> {
  const r = await clawbot<{ ok?: boolean }>("/send", { openId, text });
  return !!r?.ok;
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
  // 不因无简报早退:资金面异动可独立触发推送(与邮件 runPreOpenDigest 逻辑一致)
  const briefings = await listBriefing({ date, status: "published" });

  const users = await db.user.findMany({
    where: { weixinOpenId: { not: null } },
    select: { id: true, weixinOpenId: true },
  });
  if (users.length === 0)
    return { ok: true, date, skipped: "no-weixin-users", candidates: 0, sent: 0 };

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

    let text: string | null = null;
    if (relevant.length > 0) {
      // 有相关简报:个性化早报(同邮件)
      const brief = await getMorningBrief(Array.from(codes), relevant);
      text = formatBriefMessage(date, relevant, brief);
    } else {
      // 无相关简报:看资金面异动,有则单独提醒(同邮件)
      const ff = await fundFlowFor(Array.from(codes));
      const alerts = pickFundAlerts(ff.items);
      if (alerts.length > 0) text = formatFundMessage(ff.date, alerts);
    }
    if (!text) continue; // 既无相关简报又无资金面异动 → 不打扰

    candidates++;
    if (await sendToBridge(u.weixinOpenId, text)) sent++;
  }

  return { ok: true, date, candidates, sent };
}
