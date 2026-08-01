// Web Push(浏览器/桌面通知)发送:把当天已发布简报作为一条提醒推给所有订阅者。
// 订阅匿名(只存 endpoint + 自选快照 codes,不绑身份):带快照且命中当日条目的订阅
// 用「你的 XX 出现在今天的传导链」个性化标题(结构化拼装,零 LLM),其余回落通用提要;
// 点击都落地 /#mine(那里是完整个性化的「和我相关」)。个性化富文本仍走邮件。
import { listBriefing } from "@/lib/briefings";
import { getPrisma } from "@/lib/prisma";
import { sendPush, pushEnabled } from "@/lib/push";
import { todayISO } from "@/lib/date";
import { headlineTrigger, fmtSignedPct } from "@/lib/digest";

export async function runWebPush(): Promise<{
  ok: boolean;
  skipped?: string;
  date?: string;
  subs?: number;
  sent?: number;
  pruned?: number;
}> {
  if (!pushEnabled()) return { ok: true, skipped: "push-disabled" };
  const db = getPrisma();
  if (!db) return { ok: true, skipped: "no-database" };

  const date = todayISO();
  const items = await listBriefing({ date, status: "published" });
  if (items.length === 0) return { ok: true, skipped: "no-published", date };

  const highs = items.filter((i) => i.impact === "高");
  const lead = (highs[0] ?? items[0]).title;
  // 广播式提醒:标题置顶当天最大触发美股(信号来源,非持仓),只陈述事实涨跌
  const head = headlineTrigger(items);
  const title = head
    ? `${head.name}隔夜${fmtSignedPct(head.change)} · 关联 A股 ${items.length} 条`
    : `StockTell 今日简报 · ${items.length} 条`;
  const payload = {
    title,
    body: lead.length > 60 ? lead.slice(0, 57) + "…" : lead,
    url: "/#mine", // 落地直达「和我相关」
  };

  // D1 个性化(新手路径 v2):订阅带自选快照的,标题换成"你的票"口径——
  // 结构化拼装(条目 code→名称 映射预算一次,零 LLM 零额外查询),命不中回落广播词。
  const itemCodeNames = new Map<string, string>();
  for (const it of items) {
    if (it.triggerCode && it.triggerName) itemCodeNames.set(it.triggerCode, it.triggerName);
    for (const b of it.beneficiaries ?? []) if (b?.code && b?.name) itemCodeNames.set(b.code, b.name);
  }
  const personalize = (codes: string[]) => {
    const hitNames: string[] = [];
    for (const c of codes) {
      const n = itemCodeNames.get(c);
      if (n) hitNames.push(n);
      if (hitNames.length >= 2) break;
    }
    if (hitNames.length === 0) return payload;
    return {
      title: `你的 ${hitNames.join("、")} 出现在今天的传导链`,
      body: payload.body,
      url: "/#mine",
    };
  };

  const subs = await db.pushSubscription.findMany();
  let sent = 0;
  const gone: string[] = [];
  for (const s of subs) {
    const p = Array.isArray(s.codes) && s.codes.length > 0 ? personalize(s.codes) : payload;
    const r = await sendPush(s, p);
    if (r === "ok") sent++;
    else if (r === "gone") gone.push(s.endpoint); // 订阅失效(404/410)→ 清理
  }
  if (gone.length) {
    await db.pushSubscription.deleteMany({ where: { endpoint: { in: gone } } });
  }
  return { ok: true, date, subs: subs.length, sent, pruned: gone.length };
}
