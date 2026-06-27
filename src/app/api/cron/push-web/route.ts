import { NextRequest, NextResponse } from "next/server";
import { listBriefing } from "@/lib/briefings";
import { getPrisma } from "@/lib/prisma";
import { sendPush, pushEnabled } from "@/lib/push";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

function todayISO(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

// 把当天已发布简报作为 Web Push 推给所有订阅者(CRON_SECRET 鉴权)
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (secret && req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }
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
      url: "/",
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
    return NextResponse.json({ ok: false, error: String(e) }, { status: 500 });
  }
}
