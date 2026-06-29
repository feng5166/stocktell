import { NextRequest, NextResponse } from "next/server";
import { listBriefing } from "@/lib/briefings";
import { getPrisma } from "@/lib/prisma";
import { sendPush, pushEnabled } from "@/lib/push";
import { todayISO } from "@/lib/date";
import { isCronAuthorized } from "@/lib/api-guard";
import { alertCron } from "@/lib/monitor";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

// Web Push 已关闭(产品决定改由邮件 + 微信承载)。端点保留但直接短路,不再推送;
// 日后要恢复:删掉下面这行 + 恢复 GitHub Actions 里的触发步骤即可。
const WEB_PUSH_DISABLED = true;

// 把当天已发布简报作为 Web Push 推给所有订阅者(CRON_SECRET 鉴权)
export async function GET(req: NextRequest) {
  if (!isCronAuthorized(req)) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }
  if (WEB_PUSH_DISABLED) return NextResponse.json({ ok: true, skipped: "web-push-disabled" });
  if (!pushEnabled()) return NextResponse.json({ ok: true, skipped: "push-disabled" });
  const db = getPrisma();
  if (!db) return NextResponse.json({ ok: true, skipped: "no-database" });

  try {
    const date = todayISO();
    const items = await listBriefing({ date, status: "published" });
    if (items.length === 0)
      return NextResponse.json({ ok: true, skipped: "no-published", date });

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
      else if (r === "gone") gone.push(s.endpoint);
    }
    if (gone.length) {
      await db.pushSubscription.deleteMany({ where: { endpoint: { in: gone } } });
    }
    return NextResponse.json({ ok: true, date, subs: subs.length, sent, pruned: gone.length });
  } catch (e) {
    await alertCron("push-web(网页推送)", e);
    return NextResponse.json({ ok: false, error: String(e) }, { status: 500 });
  }
}
