// 个股雷区雷达:绑定自选/持仓的确定性风险事件(解禁/增减持/质押/ST/回购),
// 详情页 + 和我相关展示,并由 cron 提前/及时推送。纯事实陈述,不喊买卖。
import { unstable_cache } from "next/cache";
import { getPrisma } from "@/lib/prisma";
import { STOCK_MAP } from "@/data/stocks";
import { todayISO } from "@/lib/date";
import { singleFlight } from "@/lib/single-flight";
import { clawbot } from "@/lib/clawbot";
import { sendMail } from "@/lib/mailer";
import { unsubUrl } from "@/lib/unsub";
import {
  shareFloatRows,
  holderTradeRows,
  pledgeRatioLatest,
  repurchaseRows,
  currentName,
} from "@/lib/tushare";

export type RiskKind = "解禁" | "减持" | "增持" | "质押" | "ST" | "回购";

export interface RiskEvent {
  kind: RiskKind;
  severity: "high" | "mid" | "info";
  text: string; // 纯事实一行(给展示/推送)
  date: string | null; // 关键日 YYYY-MM-DD(解禁日/公告日)
  daysUntil?: number; // 解禁专用:距今天数
  key: string; // 去重键(不含 userId)
  pushable: boolean; // 是否到了该推的时点
}

const dash = (s: string) => `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}`;
function daysFromToday(ymdStr: string, todayY: string): number {
  const d = new Date(`${dash(ymdStr)}T00:00:00+08:00`).getTime();
  const t = new Date(`${dash(todayY)}T00:00:00+08:00`).getTime();
  return Math.round((d - t) / 86400000);
}
// 股东名太长截断(去掉冗长后缀)
function shortHolder(h: string): string {
  return h.replace(/(合伙企业.*|有限公司|股份有限公司|\(.*?\))/g, "").trim().slice(0, 14) || h.slice(0, 14);
}

async function computeRiskEvents(code: string): Promise<RiskEvent[]> {
  if (STOCK_MAP[code]?.market !== "A股") return [];
  const todayY = todayISO().replace(/-/g, "");
  const [floats, holders, pledge, repurch, name] = await Promise.all([
    shareFloatRows(code).catch(() => []),
    holderTradeRows(code).catch(() => []),
    pledgeRatioLatest(code).catch(() => null),
    repurchaseRows(code).catch(() => []),
    currentName(code).catch(() => null),
  ]);
  const ev: RiskEvent[] = [];

  // 解禁:未来 30 天内、占比 ≥ 5%
  for (const f of floats) {
    const du = daysFromToday(f.floatDate, todayY);
    if (du < 0 || du > 30) continue;
    const ratio = f.floatRatio ?? 0;
    if (ratio < 5) continue;
    ev.push({
      kind: "解禁",
      severity: ratio >= 10 ? "high" : "mid",
      text: `🔓 ${dash(f.floatDate).slice(5)} 解禁,占比 ${ratio.toFixed(1)}%(${f.shareType || "限售"})`,
      date: dash(f.floatDate),
      daysUntil: du,
      key: `解禁:${code}:${f.floatDate}`,
      pushable: du >= 0 && du <= 7,
    });
  }

  // 增减持:近 30 天公告;变动占比 ≥ 0.3% 才报
  for (const h of holders) {
    const du = daysFromToday(h.annDate, todayY); // 负=过去
    if (du < -30) continue;
    const cr = Math.abs(h.changeRatio ?? 0);
    if (cr < 0.3) continue;
    const recent = du >= -3;
    if (h.inDe === "DE") {
      ev.push({
        kind: "减持",
        severity: "high",
        text: `📉 ${shortHolder(h.holder)} 减持 ${cr.toFixed(2)}%${h.avgPrice ? `(均价 ${h.avgPrice} 元)` : ""}`,
        date: dash(h.annDate),
        key: `减持:${code}:${h.annDate}:${h.holder}`,
        pushable: recent,
      });
    } else if (h.inDe === "IN") {
      ev.push({
        kind: "增持",
        severity: "info",
        text: `📈 ${shortHolder(h.holder)} 增持 ${cr.toFixed(2)}%`,
        date: dash(h.annDate),
        key: `增持:${code}:${h.annDate}:${h.holder}`,
        pushable: recent,
      });
    }
  }

  // 质押:最新一期比例 ≥ 50%
  if (pledge !== null && pledge >= 50) {
    ev.push({
      kind: "质押",
      severity: "mid",
      text: `🔒 股权质押比例 ${pledge.toFixed(1)}%,偏高`,
      date: null,
      key: `质押:${code}:${Math.round(pledge)}`,
      pushable: true,
    });
  }

  // ST:当前名含 ST/*ST
  if (name && /ST/i.test(name)) {
    ev.push({
      kind: "ST",
      severity: "high",
      text: `🚩 当前为 ${name}(风险警示股)`,
      date: null,
      key: `ST:${code}`,
      pushable: true,
    });
  }

  // 回购:近 30 天公告、有金额(利多,中性陈述)。只展示 预案/实施/完成,
  // 过滤"停止/终止/未通过/股东大会通过"等非进行态(避免把已停止的回购当利多)。
  for (const r of repurch) {
    const du = daysFromToday(r.annDate, todayY);
    const proc = r.proc || "";
    if (du < -30 || !r.amountYi) continue;
    if (!/预案|实施|完成/.test(proc) || /停止|终止|未通过/.test(proc)) continue;
    ev.push({
      kind: "回购",
      severity: "info",
      text: `🔁 回购 ${r.amountYi} 亿(${r.proc || "进行中"})`,
      date: dash(r.annDate),
      key: `回购:${code}:${r.annDate}`,
      pushable: du >= -3,
    });
  }

  const rank = { high: 0, mid: 1, info: 2 };
  ev.sort(
    (a, b) => rank[a.severity] - rank[b.severity] || (a.daysUntil ?? 99) - (b.daysUntil ?? 99)
  );
  return ev;
}

// 按天缓存(keyParts 含日期 → 每天自动刷新);详情页 / 和我相关 / cron 共用。
export function riskEventsFor(code: string): Promise<RiskEvent[]> {
  // 单飞包在 compute 外:unstable_cache 不保证并发未命中只算一次,冷窗口下每只票 5 次
  // Tushare 调用会被并发放大,这里合并为一次。
  return unstable_cache(
    () => singleFlight(`risk:${code}`, () => computeRiskEvents(code)),
    ["risk-events", code, todayISO()],
    { revalidate: 21600 }
  )();
}

/* ---------- 推送 ---------- */
async function sendBridge(openId: string, text: string): Promise<boolean> {
  const r = await clawbot<{ ok?: boolean }>("/send", { openId, text });
  return !!r?.ok;
}

function formatMessage(items: { name: string; ev: RiskEvent }[]): string {
  const byStock = new Map<string, RiskEvent[]>();
  for (const it of items) {
    const arr = byStock.get(it.name) ?? [];
    arr.push(it.ev);
    byStock.set(it.name, arr);
  }
  const lines = ["⚠️ 雷区提醒 · 你的自选有重要事件", ""];
  for (const [name, evs] of Array.from(byStock.entries())) {
    lines.push(`【${name}】`);
    for (const e of evs) lines.push(`  ${e.text}`);
  }
  lines.push("", "以上为公开信息整理,提示风险,不构成投资建议。", "stocktell.me/#mine");
  return lines.join("\n");
}

async function sendRiskEmail(
  to: string,
  userId: string,
  items: { name: string; ev: RiskEvent }[]
): Promise<boolean> {
  const base = process.env.NEXTAUTH_URL || "https://stocktell.vercel.app";
  const url = unsubUrl(base, userId);
  const byStock = new Map<string, RiskEvent[]>();
  for (const it of items) {
    const arr = byStock.get(it.name) ?? [];
    arr.push(it.ev);
    byStock.set(it.name, arr);
  }
  const blocks = Array.from(byStock.entries())
    .map(
      ([name, evs]) =>
        `<div style="border:1px solid #eee;border-radius:10px;padding:10px 12px;margin-bottom:8px"><div style="font-weight:600">${name}</div>${evs
          .map((e) => `<div style="font-size:13px;color:#555;margin-top:4px">${e.text}</div>`)
          .join("")}</div>`
    )
    .join("");
  const text =
    "你的自选有重要风险事件:\n\n" +
    Array.from(byStock.entries())
      .map(([name, evs]) => `${name}\n` + evs.map((e) => `  ${e.text}`).join("\n"))
      .join("\n\n") +
    `\n\n打开看详情:${base}/#mine\n以上为公开信息整理,提示风险,不构成投资建议。\n\n不想收到?取消推送:${url}`;
  const html = `<div style="font-family:sans-serif;max-width:520px;margin:0 auto;color:#1a1d24">
    <p style="color:#888;font-size:12px;margin:0 0 10px">⚠️ StockTell 雷区提醒</p>
    ${blocks}
    <p><a href="${base}/#mine" style="display:inline-block;background:#111;color:#fff;padding:9px 18px;border-radius:8px;text-decoration:none;font-size:13px">打开 StockTell 看详情</a></p>
    <p style="color:#aaa;font-size:11px">以上为公开信息整理,提示风险,不构成投资建议。</p>
    <p style="margin:16px 0 0;text-align:center"><a href="${url}" style="color:#999;font-size:12px">取消每日推送</a></p>
  </div>`;
  return sendMail({
    to,
    subject: "你的自选有重要风险事件 · StockTell",
    text,
    html,
    headers: { "List-Unsubscribe": `<${url}>`, "List-Unsubscribe-Post": "List-Unsubscribe=One-Click" },
  });
}

export async function runRiskRadar(): Promise<{
  ok: boolean;
  skipped?: string;
  date?: string;
  candidates: number;
  pushed: number;
}> {
  const db = getPrisma();
  if (!db) return { ok: true, skipped: "no-db", candidates: 0, pushed: 0 };
  const date = todayISO();

  const users = await db.user.findMany({
    where: { riskOptOut: false, OR: [{ weixinOpenId: { not: null } }, { email: { not: null } }] },
    select: { id: true, email: true, weixinOpenId: true },
  });
  if (users.length === 0) return { ok: true, date, skipped: "no-users", candidates: 0, pushed: 0 };

  const watches = await db.watchlist.findMany({
    where: { userId: { in: users.map((u) => u.id) } },
    select: { userId: true, code: true },
  });
  const codesByUser = new Map<string, string[]>();
  const allCodes = new Set<string>();
  for (const w of watches) {
    if (STOCK_MAP[w.code]?.market !== "A股") continue;
    allCodes.add(w.code);
    const arr = codesByUser.get(w.userId) ?? [];
    arr.push(w.code);
    codesByUser.set(w.userId, arr);
  }
  if (allCodes.size === 0) return { ok: true, date, skipped: "no-codes", candidates: 0, pushed: 0 };

  const eventsByCode = new Map<string, RiskEvent[]>();
  await Promise.all(
    Array.from(allCodes).map(async (c) => eventsByCode.set(c, await riskEventsFor(c)))
  );

  const sent = await db.eventAlert.findMany({
    where: { userId: { in: users.map((u) => u.id) } },
    select: { userId: true, eventKey: true },
  });
  const sentSet = new Set(sent.map((s) => `${s.userId}|${s.eventKey}`));

  let candidates = 0;
  let pushed = 0;
  for (const u of users) {
    const codes = codesByUser.get(u.id);
    if (!codes) continue;
    const fresh: { name: string; ev: RiskEvent }[] = [];
    for (const c of codes) {
      const name = STOCK_MAP[c]?.name ?? c;
      for (const e of eventsByCode.get(c) ?? []) {
        if (!e.pushable) continue;
        if (sentSet.has(`${u.id}|${e.key}`)) continue;
        fresh.push({ name, ev: e });
      }
    }
    if (fresh.length === 0) continue;
    candidates++;
    // 渠道:有微信发微信(即时),否则邮件;成功才落去重(失败留到窗口内次日重试)
    let ok = false;
    if (u.weixinOpenId) ok = await sendBridge(u.weixinOpenId, formatMessage(fresh));
    if (!ok && u.email) ok = await sendRiskEmail(u.email, u.id, fresh);
    if (ok) {
      pushed++;
      for (const f of fresh) {
        await db.eventAlert.create({ data: { userId: u.id, eventKey: f.ev.key, date } }).catch(() => {});
      }
    }
  }
  return { ok: true, date, candidates, pushed };
}
