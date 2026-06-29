// 盘中重大事件补推(方案 A:自选个股盘中异动)。
// 仅交易日 09:30–11:30 / 13:00–15:00(北京)运行;|涨跌|≥阈值视为异动;
// 仅推已绑微信、未关该提醒、且持有该票的用户;同用户·同票·同天去重,每人每天封顶。
import { getPrisma } from "@/lib/prisma";
import { STOCK_MAP } from "@/data/stocks";
import { todayISO } from "@/lib/date";
import { isAshareTradingDay } from "@/lib/tushare";
import { fetchQuotes } from "@/lib/quotes";
import { clawbot } from "@/lib/clawbot";

const THRESHOLD = 7; // |涨跌%| ≥ 7 视为盘中异动(阈值取高,避免噪音)
const DAILY_CAP = 3; // 每人每天最多提醒的股票数(防刷屏)

// 北京时间分钟数(0–1439)+ "HH:MM"
function beijingTime(): { minutes: number; label: string } {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Shanghai",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(new Date());
  const h = Number(parts.find((p) => p.type === "hour")?.value ?? "0");
  const m = Number(parts.find((p) => p.type === "minute")?.value ?? "0");
  return {
    minutes: h * 60 + m,
    label: `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`,
  };
}
function inTradingWindow(min: number): boolean {
  return (min >= 9 * 60 + 30 && min <= 11 * 60 + 30) || (min >= 13 * 60 && min <= 15 * 60);
}

async function sendBridge(openId: string, text: string): Promise<boolean> {
  const r = await clawbot<{ ok?: boolean }>("/send", { openId, text });
  return !!r?.ok;
}

export async function runIntradayAlert(): Promise<{
  ok: boolean;
  skipped?: string;
  date?: string;
  checked?: number;
  alerts?: number;
  sent?: number;
}> {
  const { minutes, label } = beijingTime();
  if (!inTradingWindow(minutes)) return { ok: true, skipped: "off-hours" };

  const db = getPrisma();
  if (!db) return { ok: true, skipped: "no-db" };

  const date = todayISO();
  if (!(await isAshareTradingDay(date)))
    return { ok: true, skipped: "non-trading-day", date };

  const users = await db.user.findMany({
    where: { weixinOpenId: { not: null }, intradayOptOut: false },
    select: { id: true, weixinOpenId: true },
  });
  if (users.length === 0) return { ok: true, date, skipped: "no-users" };

  const watches = await db.watchlist.findMany({
    where: { userId: { in: users.map((u) => u.id) } },
    select: { userId: true, code: true },
  });
  // 只看 A 股(美股盘中闭市)
  const codesByUser = new Map<string, string[]>();
  const allCodes = new Set<string>();
  for (const w of watches) {
    if (STOCK_MAP[w.code]?.market !== "A股") continue;
    allCodes.add(w.code);
    const arr = codesByUser.get(w.userId) ?? [];
    arr.push(w.code);
    codesByUser.set(w.userId, arr);
  }
  if (allCodes.size === 0) return { ok: true, date, skipped: "no-a-codes" };

  const { quotes } = await fetchQuotes(Array.from(allCodes));

  // 今日已提醒(去重 + 每人每日上限)
  const todays = await db.intradayAlert.findMany({
    where: { date, userId: { in: users.map((u) => u.id) } },
    select: { userId: true, code: true },
  });
  const sentByUser = new Map<string, Set<string>>();
  for (const r of todays) {
    const s = sentByUser.get(r.userId) ?? new Set<string>();
    s.add(r.code);
    sentByUser.set(r.userId, s);
  }

  let alerts = 0;
  let sent = 0;
  for (const u of users) {
    if (!u.weixinOpenId) continue;
    const codes = codesByUser.get(u.id);
    if (!codes) continue;
    const already = sentByUser.get(u.id) ?? new Set<string>();
    const remaining = DAILY_CAP - already.size;
    if (remaining <= 0) continue;

    const fresh = codes
      .filter((c) => {
        const q = quotes[c];
        return q && Math.abs(q.change) >= THRESHOLD && !already.has(c);
      })
      .slice(0, remaining);
    if (fresh.length === 0) continue;

    const lines = [`⚡ 盘中异动 · ${label}`, ""];
    for (const c of fresh) {
      const q = quotes[c]!;
      lines.push(`${STOCK_MAP[c].name} ${q.change > 0 ? "+" : ""}${q.change.toFixed(2)}%`);
    }
    lines.push("", "stocktell.me/#mine 看详情", "信息提示,不构成投资建议");

    alerts += fresh.length;
    const ok = await sendBridge(u.weixinOpenId, lines.join("\n"));
    if (ok) sent++;
    // 不论送达成功与否都落去重:送不进(超 24h 窗口)当天重试也进不去,避免每 10 分钟重复打桥
    for (const c of fresh) {
      await db.intradayAlert
        .create({ data: { userId: u.id, code: c, date } })
        .catch(() => {});
    }
  }

  return { ok: true, date, checked: allCodes.size, alerts, sent };
}
