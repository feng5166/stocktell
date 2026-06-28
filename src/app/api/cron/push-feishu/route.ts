import { NextRequest, NextResponse } from "next/server";
import { listBriefing } from "@/lib/briefings";
import { sendFeishu } from "@/lib/feishu";
import { todayISO } from "@/lib/date";
import { isCronAuthorized } from "@/lib/api-guard";
import { alertCron } from "@/lib/monitor";

export const dynamic = "force-dynamic";

const DOT: Record<string, string> = { 高: "🔴", 中: "🟡", 低: "🟢" };

// 把当天已发布简报推一条到飞书(CRON_SECRET 鉴权;由 GitHub Actions 定时触发)
export async function GET(req: NextRequest) {
  if (!isCronAuthorized(req)) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }
  try {
    const date = todayISO();
    const items = await listBriefing({ date, status: "published" });
    if (items.length === 0) {
      return NextResponse.json({ ok: true, skipped: "no-published", date });
    }
    const lines = [`📊 StockTell 今日简报 | ${date}`, ""];
    for (const it of items.slice(0, 8)) {
      lines.push(`${DOT[it.impact] ?? ""} ${it.title}`);
      if (it.beneficiaries.length) {
        lines.push(`   → ${it.beneficiaries.map((b) => b.name).join(" / ")}`);
      }
    }
    lines.push("", "—", "StockTell · 不构成投资建议");
    lines.push("https://stocktell.vercel.app");

    await sendFeishu(lines.join("\n"));
    return NextResponse.json({ ok: true, date, pushed: items.length });
  } catch (e) {
    await alertCron("push-feishu(飞书推送)", e);
    return NextResponse.json({ ok: false, error: String(e) }, { status: 500 });
  }
}
