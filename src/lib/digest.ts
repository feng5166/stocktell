// 盘前推送:给有自选、且今天有相关简报的登录用户,发一封个性化早报。
// 顶部是 LLM 综合的一段「你的票今天该看什么」,下面附相关动态列表。
// 只在有相关动态时发(不骚扰"今天没事");Resend 没配就降级打印,不报错。
import { getPrisma } from "@/lib/prisma";
import { listBriefing, type BriefingItem } from "@/lib/briefings";
import { todayISO } from "@/lib/date";
import { sendMail } from "@/lib/mailer";
import { getMorningBrief } from "@/lib/morning-brief";
import { fundFlowFor, type FundFlowItem } from "@/lib/fund-flow";
import { riskEventsFor } from "@/lib/risk-radar";
import { STOCK_MAP } from "@/data/stocks";
import { unsubFooter } from "@/lib/unsub";

// 全量发信节流 + 失败重试:Resend 有速率上限,无间隔紧循环会偶发 429 丢邮件
// (已踩:2026-07-01 全量推送 peggiezhou 撞限流失败)。每封间隔 + 失败等一下重试一次。
const DIGEST_THROTTLE_MS = Number(process.env.DIGEST_THROTTLE_MS ?? 500);
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
async function trySend(fn: () => Promise<boolean>): Promise<boolean> {
  if (await fn()) return true;
  await sleep(1500); // 撞限流/瞬时失败 → 稍等重试一次
  return fn();
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

// 「你的票要注意」:雷区(解禁/减持/质押/ST,高优先在前)+ 资金面异动,合并成可读行(emoji 自带)。
// 微信(push-weixin)与邮件共用,保证两边内容一致。回购/增持等中性信息(severity=info)不挤进来。
export async function buildWatchAlerts(codes: string[]): Promise<string[]> {
  const rank: Record<string, number> = { high: 0, mid: 1, info: 2 };
  const risk: { sev: number; line: string }[] = [];
  const pairs = await Promise.all(
    codes.map(async (c) => [c, await riskEventsFor(c).catch(() => [])] as const)
  );
  for (const [c, evs] of pairs) {
    const name = STOCK_MAP[c]?.name ?? c;
    for (const e of evs) {
      if (e.severity === "info") continue; // 中性信息(回购/增持)不进"要注意"
      risk.push({ sev: rank[e.severity] ?? 1, line: `${e.text} · ${name}` });
    }
  }
  risk.sort((a, b) => a.sev - b.sev);
  const lines = risk.slice(0, 4).map((r) => r.line);
  try {
    const ff = await fundFlowFor(codes);
    for (const it of pickFundAlerts(ff.items).slice(0, 3)) lines.push(`💰 ${fundAlertLine(it)}`);
  } catch {
    /* 资金面拿不到不致命 */
  }
  return lines.slice(0, 6);
}

// 无相关简报、但你的持仓有雷区/资金面异动时的提醒邮件。
async function sendAlertsDigest(
  to: string,
  userId: string,
  alertLines: string[]
): Promise<boolean> {
  const base = process.env.NEXTAUTH_URL || "https://stocktell.me";
  const unsub = unsubFooter(base, userId);
  const text =
    `今天没有跟你的票相关的隔夜美股动态,但你的持仓有以下要注意:\n\n` +
    alertLines.map((l) => `· ${l}`).join("\n") +
    `\n\n打开看详情:${base}/#mine\n\n以上为信息整理,不构成投资建议。` +
    unsub.text;
  const html = `<div style="font-family:sans-serif;max-width:520px;margin:0 auto;color:#1a1d24">
    <p style="color:#888;font-size:12px;margin:0 0 10px">StockTell 盘前提醒</p>
    <p style="font-size:14px;margin:0 0 12px">今天没有跟你的票相关的隔夜美股动态,但你的持仓有 <b>⚠️ 要注意</b>:</p>
    ${alertLines
      .map(
        (l) => `<div style="border:1px solid #eee;border-radius:10px;padding:10px 12px;margin-bottom:8px;font-size:13px">${l}</div>`
      )
      .join("")}
    <p><a href="${base}/#mine" style="display:inline-block;background:#111;color:#fff;padding:9px 18px;border-radius:8px;text-decoration:none;font-size:13px">打开 StockTell 看详情</a></p>
    <p style="color:#aaa;font-size:11px">以上为信息整理,不构成投资建议。历史规律不代表未来表现。</p>
    ${unsub.html}
  </div>`;

  return sendMail({
    to,
    subject: `你的持仓今天有 ${alertLines.length} 条要注意 · StockTell`,
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

// 选当天最有信号的触发美股(|涨跌|最大)用于推送标题置顶。触发美股=隔夜异动的"信号来源",
// 非用户持仓;标题只陈述事实(隔夜涨跌幅)+ 关联条数,不含任何操作暗示,守保守合规口径。
export function headlineTrigger(
  items: BriefingItem[]
): { name: string; change: number } | null {
  let best: { name: string; change: number } | null = null;
  for (const it of items) {
    if (it.triggerName && typeof it.triggerChange === "number") {
      if (!best || Math.abs(it.triggerChange) > Math.abs(best.change)) {
        best = { name: it.triggerName, change: it.triggerChange };
      }
    }
  }
  return best;
}

export function fmtSignedPct(v: number): string {
  return `${v > 0 ? "+" : ""}${v.toFixed(1)}%`;
}

async function sendDigest(
  to: string,
  userId: string,
  date: string,
  items: BriefingItem[],
  brief: string,
  alerts: string[]
): Promise<boolean> {
  const base = process.env.NEXTAUTH_URL || "https://stocktell.me";
  const unsub = unsubFooter(base, userId);
  const rows = items.map((it) => {
    const benes = it.beneficiaries.map((b) => b.name).join("、");
    return { impact: it.impact, title: it.title, benes, take: oneLineTake(it.retailTake) };
  });
  const alertText = alerts.length
    ? `\n\n⚠️ 你的票要注意\n${alerts.map((l) => `· ${l}`).join("\n")}`
    : "";
  const alertHtml = alerts.length
    ? `<div style="font-size:13px;color:#666;margin:0 0 8px">⚠️ 你的票要注意</div>${alerts
        .map(
          (l) => `<div style="border:1px solid #f0d9b5;background:#fffaf0;border-radius:10px;padding:8px 12px;margin-bottom:8px;font-size:13px">${l}</div>`
        )
        .join("")}`
    : "";
  const text =
    `${brief}${alertText}\n\n—— 跟你票相关 ——\n` +
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
    ${alertHtml}
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

  // 标题置顶触发美股,让用户在收件箱第一眼就懂"为什么今天有这封"
  const head = headlineTrigger(items);
  const subject = head
    ? `${head.name}隔夜${fmtSignedPct(head.change)},你的自选 ${items.length} 条相关 · StockTell`
    : `你的自选今天有 ${items.length} 条相关动态 · StockTell`;

  return sendMail({
    to,
    subject,
    text,
    html,
    headers: unsub.headers,
  });
}

export interface DigestUserResult {
  userId: string;
  email: string;
  mode: "digest" | "alerts";
  sent: boolean; // sendMail 是否成功
}

// 发送成功后落每用户当日记录(digest_send_log)。写失败不阻断发送——记录是幂等优化,不是发送前提。
async function markDigestSent(
  db: NonNullable<ReturnType<typeof getPrisma>>,
  date: string,
  userId: string,
  mode: "digest" | "alerts"
) {
  try {
    await db.digestSendLog.upsert({
      where: { date_userId: { date, userId } },
      create: { date, userId, mode },
      update: { mode },
    });
  } catch {
    /* 表未建/写失败:不影响发送本身 */
  }
}

export async function runPreOpenDigest(opts?: {
  force?: boolean; // true=忽略当日已发记录全量重发(默认只发没发过的)
}): Promise<{
  ok: boolean;
  skipped?: string;
  date?: string;
  candidates: number; // 有相关动态、该收到的用户数
  sent: number; // 实际发出数(Resend 没配时为 0)
  failed?: number; // 该发但发送失败的数量
  alreadySent?: number; // 当日已发过而跳过的用户数(补发幂等,2026-07-03 复盘产物)
  results?: DigestUserResult[]; // 逐用户结果(供后台记录失败)
}> {
  const db = getPrisma();
  if (!db) return { ok: true, skipped: "no-db", candidates: 0, sent: 0 };

  const date = todayISO();

  // 当日已发过的用户(重跑/补发时跳过,除非 force)。表还没建时当作无记录。
  let sentBefore = new Set<string>();
  if (!opts?.force) {
    try {
      const logs = await db.digestSendLog.findMany({
        where: { date },
        select: { userId: true },
      });
      sentBefore = new Set(logs.map((l) => l.userId));
    } catch {
      /* 表未建 → 全量发 */
    }
  }
  let alreadySent = 0;
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
  const results: DigestUserResult[] = [];
  for (const u of users) {
    if (!u.email) continue;
    const codes = codesByUser.get(u.id);
    if (!codes || codes.size === 0) continue;
    if (sentBefore.has(u.id)) {
      alreadySent++;
      continue; // 今天已发过:补发/重跑只补漏,不重复打扰
    }
    const relevant = briefings.filter(
      (b) =>
        (b.triggerCode != null && codes.has(b.triggerCode)) ||
        b.beneficiaries.some((x) => codes.has(x.code))
    );

    // 你的持仓自身要注意的事(雷区 + 资金面),无论有没有隔夜简报都算高信号
    const alerts = await buildWatchAlerts(Array.from(codes));

    if (relevant.length > 0) {
      // 有相关简报:个性化早报 + 你的票要注意 + 相关动态
      candidates++;
      const brief = await getMorningBrief(Array.from(codes), relevant);
      const ok = await trySend(() =>
        sendDigest(u.email!, u.id, date, relevant, brief, alerts)
      );
      results.push({ userId: u.id, email: u.email, mode: "digest", sent: ok });
      if (ok) {
        sent++;
        await markDigestSent(db, date, u.id, "digest");
      }
      await sleep(DIGEST_THROTTLE_MS);
      continue;
    }

    // 无相关简报:只要持仓有雷区/资金面异动就提醒
    if (alerts.length === 0) continue; // 既无简报又无要注意 → 不打扰
    candidates++;
    const ok = await trySend(() => sendAlertsDigest(u.email!, u.id, alerts));
    results.push({ userId: u.id, email: u.email, mode: "alerts", sent: ok });
    if (ok) {
      sent++;
      await markDigestSent(db, date, u.id, "alerts");
    }
    await sleep(DIGEST_THROTTLE_MS);
  }
  const failed = results.filter((r) => !r.sent).length;
  // 记录失败到运行日志(便于排查),并随返回值给后台
  if (failed > 0) {
    console.error(
      "[digest] 发送失败:",
      results.filter((r) => !r.sent).map((r) => r.email).join(", ")
    );
  }
  return { ok: true, date, candidates, sent, failed, alreadySent, results };
}

// 给单个用户发一封真·digest(复用与全量推送完全相同的 sendDigest/sendAlertsDigest 模板)。
// 用于后台预览/自测邮件格式,不影响其它用户。返回命中模式与是否发出。
export async function sendDigestToUser(
  userId: string,
  deliverTo?: string // 覆盖投递地址:按 userId 的自选渲染,但发到这个邮箱(抽查/预览用)
): Promise<{
  ok: boolean;
  reason?: string;
  mode?: "digest" | "alerts";
  sent?: boolean;
  email?: string; // 实际投递到的地址
  sourceEmail?: string; // 内容所属用户
  relevant?: number;
}> {
  const db = getPrisma();
  if (!db) return { ok: false, reason: "no-db" };
  const u = await db.user.findUnique({
    where: { id: userId },
    select: { id: true, email: true },
  });
  if (!u?.email) return { ok: false, reason: "no-email" };
  const to = deliverTo || u.email;

  const date = todayISO();
  const briefings = await listBriefing({ date, status: "published" });
  const ws = await db.watchlist.findMany({ where: { userId }, select: { code: true } });
  const codes = new Set(ws.map((w) => w.code));
  if (codes.size === 0)
    return { ok: false, reason: "no-watchlist", email: to, sourceEmail: u.email };

  const relevant = briefings.filter(
    (b) =>
      (b.triggerCode != null && codes.has(b.triggerCode)) ||
      b.beneficiaries.some((x) => codes.has(x.code))
  );
  const alerts = await buildWatchAlerts(Array.from(codes));

  if (relevant.length > 0) {
    const brief = await getMorningBrief(Array.from(codes), relevant);
    const sent = await sendDigest(to, u.id, date, relevant, brief, alerts);
    // 发到用户本人地址=真实投递,计入当日已发;带 deliverTo 的抽查/预览不计
    if (sent && !deliverTo) await markDigestSent(db, date, u.id, "digest");
    return { ok: true, mode: "digest", sent, email: to, sourceEmail: u.email, relevant: relevant.length };
  }
  if (alerts.length === 0)
    return { ok: false, reason: "nothing-relevant", email: to, sourceEmail: u.email, relevant: 0 };
  const sent = await sendAlertsDigest(to, u.id, alerts);
  if (sent && !deliverTo) await markDigestSent(db, date, u.id, "alerts");
  return { ok: true, mode: "alerts", sent, email: to, sourceEmail: u.email, relevant: 0 };
}
