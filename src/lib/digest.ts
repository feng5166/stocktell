// 盘前推送:给有自选、且今天有相关简报的登录用户,发一封个性化早报。
// 顶部是 LLM 综合的一段「你的票今天该看什么」,下面附相关动态列表。
// 只在有相关动态时发(不骚扰"今天没事");Resend 没配就降级打印,不报错。
import { getPrisma } from "@/lib/prisma";
import { listBriefing, type BriefingItem } from "@/lib/briefings";
import { todayISO } from "@/lib/date";
import { sendMail } from "@/lib/mailer";
import { getMorningBrief } from "@/lib/morning-brief";
import { fundFlowFor, type FundFlowItem } from "@/lib/fund-flow";
import { unsubUrl } from "@/lib/unsub";

// 邮件页脚:取消推送按钮(HTML)+ 纯文本退订行 + List-Unsubscribe 头(邮件客户端原生一键退订)
function unsubParts(base: string, userId: string) {
  const url = unsubUrl(base, userId);
  const html = `<p style="margin:16px 0 0;text-align:center">
      <a href="${url}" style="display:inline-block;color:#999;font-size:12px;text-decoration:none;border:1px solid #e2e2e2;border-radius:8px;padding:7px 14px">取消每日推送</a>
    </p>`;
  const text = `\n\n不想再收到每日推送?点此取消:${url}`;
  const headers = {
    "List-Unsubscribe": `<${url}>`,
    "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
  };
  return { html, text, headers };
}

// 资金面"异动"阈值(绝对额,亿元):达到才单独触发推送,避免日常小波动骚扰
const NET_MF_ALERT = 3.0; // 主力净流入/流出
const RZ_ALERT = 2.0; // 融资余额变化

export function pickFundAlerts(items: FundFlowItem[]): FundFlowItem[] {
  return items.filter(
    (it) =>
      (it.netMf !== null && Math.abs(it.netMf) >= NET_MF_ALERT) ||
      it.longhu !== null ||
      (it.rzChgYi !== null && Math.abs(it.rzChgYi) >= RZ_ALERT)
  );
}

export function fmtYi(v: number) {
  return `${v > 0 ? "+" : ""}${v.toFixed(1)}亿`;
}

// 资金面异动一行文本(微信/邮件纯文本通用):「兆易创新:主力+3.2亿 / 融资+2.1亿 / 上龙虎榜+1.5亿」
export function fundAlertLine(it: FundFlowItem): string {
  const parts: string[] = [];
  if (it.netMf !== null) parts.push(`主力${fmtYi(it.netMf)}`);
  if (it.rzChgYi !== null) parts.push(`融资${fmtYi(it.rzChgYi)}`);
  if (it.longhu) parts.push(`上龙虎榜${fmtYi(it.longhu.net)}`);
  return `${it.name}:${parts.join(" / ")}`;
}

// 资金面专属推送(无相关简报、但你的票资金面有异动时)。纯事实罗列,不调 LLM、不喊买卖。
async function sendFundDigest(
  to: string,
  userId: string,
  date: string | null,
  alerts: FundFlowItem[]
): Promise<boolean> {
  const base = process.env.NEXTAUTH_URL || "https://stocktell.vercel.app";
  const unsub = unsubParts(base, userId);
  const line = fundAlertLine; // 与微信推送共用同一行格式,保证两边内容一致
  const text =
    `今天没有跟你的票相关的隔夜美股动态,但你的自选资金面有异动${
      date ? `(截至 ${date})` : ""
    }:\n\n` +
    alerts.map((it) => `· ${line(it)}`).join("\n") +
    `\n\n打开看详情:${base}/#mine\n\n以上为信息整理,不构成投资建议。` +
    unsub.text;
  const html = `<div style="font-family:sans-serif;max-width:520px;margin:0 auto;color:#1a1d24">
    <p style="color:#888;font-size:12px;margin:0 0 10px">StockTell 盘前提醒${
      date ? ` · 资金面截至 ${date}` : ""
    }</p>
    <p style="font-size:14px;margin:0 0 12px">今天没有跟你的票相关的隔夜美股动态,但你的自选<b>资金面有异动</b>:</p>
    ${alerts
      .map(
        (it) => `<div style="border:1px solid #eee;border-radius:10px;padding:10px 12px;margin-bottom:8px">
        <div style="font-weight:600">${it.name}</div>
        <div style="font-size:12px;color:#555;margin-top:4px">${line(it).split(":")[1] ?? ""}</div>
      </div>`
      )
      .join("")}
    <p><a href="${base}/#mine" style="display:inline-block;background:#111;color:#fff;padding:9px 18px;border-radius:8px;text-decoration:none;font-size:13px">打开 StockTell 看详情</a></p>
    <p style="color:#aaa;font-size:11px">以上为信息整理,不构成投资建议。历史规律不代表未来表现。</p>
    ${unsub.html}
  </div>`;

  return sendMail({
    to,
    subject: `你的自选今天资金面有异动 · StockTell`,
    text,
    html,
    headers: unsub.headers,
  });
}

// 把「散户怎么想」压成推送里的一句话:取前 1-2 句、去掉免责尾巴、封顶 ~60 字。
// 微信(push-weixin)与邮件共用,保证两边一致。
export function oneLineTake(take: string | null | undefined): string {
  if (!take) return "";
  let t = take.replace(/[（(][^）)]*不构成投资建议[^）)]*[）)]/g, "").trim();
  const m = t.match(/^[^。!?！?]*[。!?！?]?[^。!?！?]*[。!?！?]?/);
  t = (m?.[0] || t).trim();
  if (t.length > 60) t = t.slice(0, 58) + "…";
  return t;
}

async function sendDigest(
  to: string,
  userId: string,
  date: string,
  items: BriefingItem[],
  brief: string
): Promise<boolean> {
  const base = process.env.NEXTAUTH_URL || "https://stocktell.vercel.app";
  const unsub = unsubParts(base, userId);
  const rows = items.map((it) => {
    const benes = it.beneficiaries.map((b) => b.name).join("、");
    return { impact: it.impact, title: it.title, benes, take: oneLineTake(it.retailTake) };
  });
  const text =
    `${brief}\n\n—— 跟你票相关 ——\n` +
    rows
      .map(
        (r) =>
          `· [${r.impact}] ${r.title}${r.benes ? ` — 涉及你的:${r.benes}` : ""}${
            r.take ? `\n  怎么想:${r.take}` : ""
          }`
      )
      .join("\n") +
    `\n\n打开看详情:${base}/#mine\n\n以上为信息整理,不构成投资建议。` +
    unsub.text;
  const html = `<div style="font-family:sans-serif;max-width:520px;margin:0 auto;color:#1a1d24">
    <p style="color:#888;font-size:12px;margin:0 0 6px">${date} · StockTell 盘前早报</p>
    <p style="font-size:14px;line-height:1.75;background:#fffef6;border:1px solid #f0e9c8;border-radius:10px;padding:12px 14px;margin:0 0 14px">${brief}</p>
    <div style="font-size:13px;color:#666;margin:0 0 8px">跟你票相关</div>
    ${rows
      .map(
        (r) => `<div style="border:1px solid #eee;border-radius:10px;padding:10px 12px;margin-bottom:8px">
        <div style="font-size:12px;color:#888">${r.impact}影响</div>
        <div style="font-weight:600">${r.title}</div>
        ${r.benes ? `<div style="font-size:12px;color:#555;margin-top:4px">涉及你的:${r.benes}</div>` : ""}
        ${r.take ? `<div style="font-size:13px;color:#1a1d24;margin-top:6px">怎么想:${r.take}</div>` : ""}
      </div>`
      )
      .join("")}
    <p><a href="${base}/#mine" style="display:inline-block;background:#111;color:#fff;padding:9px 18px;border-radius:8px;text-decoration:none;font-size:13px">打开 StockTell 看详情</a></p>
    <p style="color:#aaa;font-size:11px">以上为信息整理,不构成投资建议。历史规律不代表未来表现。</p>
    ${unsub.html}
  </div>`;

  return sendMail({
    to,
    subject: `你的自选今天有 ${items.length} 条相关动态 · StockTell`,
    text,
    html,
    headers: unsub.headers,
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
  // 没简报也继续:资金面异动可独立触发推送
  const briefings = await listBriefing({ date, status: "published" });

  const users = await db.user.findMany({
    where: { email: { not: null }, digestOptOut: false }, // 跳过已退订的用户
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

    if (relevant.length > 0) {
      // 有相关简报:发个性化早报(早报里已含资金面)
      candidates++;
      const brief = await getMorningBrief(Array.from(codes), relevant);
      if (await sendDigest(u.email, u.id, date, relevant, brief)) sent++;
      continue;
    }

    // 无相关简报:看资金面是否有异动,有则单独提醒
    const ff = await fundFlowFor(Array.from(codes));
    const alerts = pickFundAlerts(ff.items);
    if (alerts.length === 0) continue; // 既无简报又无资金面异动 → 不打扰
    candidates++;
    if (await sendFundDigest(u.email, u.id, ff.date, alerts)) sent++;
  }
  return { ok: true, date, candidates, sent };
}
