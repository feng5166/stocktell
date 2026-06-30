// Web Push(浏览器/桌面通知)发送:把当天已发布简报作为一条提醒推给所有订阅者。
// 订阅表只存 endpoint(不绑用户),所以是「广播式提醒」——内容为通用提要,
// 点击落地 /#mine(那里才是个性化的「和我相关」)。个性化富文本仍走邮件。
import { listBriefing } from "@/lib/briefings";
import { getPrisma } from "@/lib/prisma";
import { sendPush, pushEnabled } from "@/lib/push";
import { todayISO } from "@/lib/date";

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
  const payload = {
    title: `StockTell 今日简报 · ${items.length} 条`,
    body: lead.length > 60 ? lead.slice(0, 57) + "…" : lead,
    url: "/#mine", // 落地直达「和我相关」
  };

  const subs = await db.pushSubscription.findMany();
  let sent = 0;
  const gone: string[] = [];
  for (const s of subs) {
    const r = await sendPush(s, payload);
    if (r === "ok") sent++;
    else if (r === "gone") gone.push(s.endpoint); // 订阅失效(404/410)→ 清理
  }
  if (gone.length) {
    await db.pushSubscription.deleteMany({ where: { endpoint: { in: gone } } });
  }
  return { ok: true, date, subs: subs.length, sent, pruned: gone.length };
}
