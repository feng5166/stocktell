import { getPrisma } from "@/lib/prisma";
import { listBriefing, type BriefingItem } from "@/lib/briefings";
import { todayISO } from "@/lib/date";
import { getMorningBrief } from "@/lib/morning-brief";
import { clawbot } from "@/lib/clawbot";
import { buildWatchAlerts, oneLineTake, headlineTrigger, fmtSignedPct } from "@/lib/digest";
import { TIER } from "@/data/stocks";
import { alertThrottled } from "@/lib/monitor";

const DOT: Record<string, string> = { 高: "🔴", 中: "🟡", 低: "🟢" };

// 受益股名带轻量梯队标签:光迅科技(龙头)
function nameWithTier(b: { code: string; name: string }): string {
  const t = TIER[b.code];
  return t ? `${b.name}(${t})` : b.name;
}

// 相关简报版:个性化早报 + ⚠️你的票要注意(雷区/资金面)+ 相关动态(每条"怎么想")
function formatBriefMessage(
  date: string,
  items: BriefingItem[],
  brief: string,
  alerts: string[]
): string {
  // 首行置顶触发美股(信号来源、非持仓),聊天列表第一眼就懂"为什么有这条"
  const head = headlineTrigger(items);
  const title = head
    ? `📊 ${head.name}隔夜${fmtSignedPct(head.change)} · StockTell ${date}`
    : `📊 StockTell · ${date} 盘前早报`;
  const lines = [title, "", brief, ""];
  if (alerts.length) {
    lines.push("⚠️ 你的票要注意", ...alerts.map((a) => `· ${a}`), "");
  }
  lines.push("—— 跟你票相关 ——", "");
  for (const it of items) {
    lines.push(`${DOT[it.impact] ?? ""} ${it.title}`);
    if (it.beneficiaries.length) {
      lines.push(`   涉及你的:${it.beneficiaries.map(nameWithTier).join(" · ")}`);
    }
    const take = oneLineTake(it.retailTake);
    if (take) lines.push(`   怎么想:${take}`);
    lines.push("");
  }
  lines.push("www.stocktell.me/#mine 看完整简报");
  lines.push("以上不构成投资建议");
  return lines.join("\n");
}

// 仅"要注意"版:无相关简报、但你的持仓有雷区/资金面异动时
function formatAlertsMessage(date: string, alerts: string[]): string {
  const lines = [
    `📊 StockTell · ${date} 盘前提醒`,
    "",
    "今天没有跟你的票相关的隔夜美股动态,但你的持仓有以下要注意:",
    "",
    ...alerts.map((a) => `· ${a}`),
    "",
    "www.stocktell.me/#mine 看详情",
    "以上不构成投资建议",
  ];
  return lines.join("\n");
}

// 经自托管桥 /send 发送。统一走 clawbot 助手(CLAWBOT_BASE_URL + CLAWBOT_SECRET 一处配置)。
async function sendToBridge(openId: string, text: string): Promise<boolean> {
  const r = await clawbot<{ ok?: boolean }>("/send", { openId, text });
  return !!r?.ok;
}

// 发送循环时间预算(2026-07-30,与 digest 同款护栏):逐用户串行且单用户含 LLM(早报)+桥 10s
// 超时,maxDuration=300s 会被平台硬杀=静默丢批。留 30s 收尾;微信【没有】per-user 发送日志,
// 截断的用户当天收不到(与被硬杀时一样),但换来确定性收尾 + 告警可感知。用户量起来后若
// 频繁截断,先给微信补 send_log 幂等再谈拆批。
const WEIXIN_SEND_BUDGET_MS = 270_000;

export async function runWeixinPush(): Promise<{
  ok: boolean;
  skipped?: string;
  date?: string;
  candidates: number;
  sent: number;
  truncated?: number;
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
  let truncated = 0;
  const deadlineAt = Date.now() + WEIXIN_SEND_BUDGET_MS;
  const queue = users.filter((u) => u.weixinOpenId && (codesByUser.get(u.id)?.size ?? 0) > 0);
  for (let qi = 0; qi < queue.length; qi++) {
    if (Date.now() >= deadlineAt) {
      truncated = queue.length - qi;
      break;
    }
    const u = queue[qi];
    const codes = codesByUser.get(u.id)!;

    const relevant = briefings.filter(
      (b) =>
        (b.triggerCode != null && codes.has(b.triggerCode)) ||
        b.beneficiaries.some((x) => codes.has(x.code))
    );

    // 你的持仓自身要注意的事(雷区 + 资金面),与邮件 buildWatchAlerts 共用
    const alerts = await buildWatchAlerts(Array.from(codes));

    // 验证点进展信号(2.3 P1-3):关注的验证点所属票今天被事件点名 → 提示行(结构化零 LLM);
    // 无进展不加行(反焦虑)。fail-safe:表未建/查询失败不影响早报主体。
    try {
      const mentioned = new Set<string>();
      for (const b of relevant) {
        if (b.triggerCode) mentioned.add(b.triggerCode);
        for (const x of b.beneficiaries) mentioned.add(x.code);
      }
      if (mentioned.size > 0) {
        const follows = await db.verifyFollow.findMany({
          where: { userId: u.id, code: { in: Array.from(mentioned) } },
          select: { code: true, point: true },
          take: 5,
        });
        for (const f of follows) {
          const name = briefings
            .flatMap((b) => [
              ...(b.triggerCode === f.code && b.triggerName ? [b.triggerName] : []),
              ...b.beneficiaries.filter((x) => x.code === f.code).map((x) => x.name),
            ])[0] ?? f.code;
          alerts.push(`你关注的验证点:${name}「${f.point}」——它今天出现在传导链,留意相关披露是否兑现`);
        }
      }
    } catch {
      /* 验证点提示失败不影响早报 */
    }

    let text: string | null = null;
    if (relevant.length > 0) {
      // 有相关简报:个性化早报 + 要注意 + 相关动态
      const brief = await getMorningBrief(Array.from(codes), relevant, { trusted: true });
      text = formatBriefMessage(date, relevant, brief, alerts);
    } else if (alerts.length > 0) {
      // 无相关简报:只要持仓有雷区/资金面异动就提醒
      text = formatAlertsMessage(date, alerts);
    }
    if (!text) continue; // 既无相关简报又无要注意 → 不打扰

    candidates++;
    if (await sendToBridge(u.weixinOpenId!, text)) sent++;
  }

  if (truncated > 0) {
    console.error(`[weixin-push] 时间预算耗尽截断:已发 ${sent},剩 ${truncated} 人`);
    await alertThrottled(
      "weixin-push-truncated",
      `⚠️ StockTell 微信推送因时间预算截断(${date}):已发 ${sent},剩 ${truncated} 人当天收不到(微信无 per-user 发送日志,无法补位续发)。频繁出现需先补 send_log 幂等再拆批。`
    );
  }
  return { ok: true, date, candidates, sent, truncated };
}
