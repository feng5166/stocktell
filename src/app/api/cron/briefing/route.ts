import { NextRequest, NextResponse } from "next/server";
import { generateDrafts } from "@/lib/generate";
import { insertDrafts, listBriefing } from "@/lib/briefings";
import { runPreOpenDigest } from "@/lib/digest";
import { todayISO } from "@/lib/date";
import { isAshareTradingDay } from "@/lib/tushare";
import { isCronAuthorized } from "@/lib/api-guard";
import { alertCron } from "@/lib/monitor";

export const dynamic = "force-dynamic";
export const maxDuration = 60; // LLM 生成可能要几十秒

export async function GET(req: NextRequest) {
  // 鉴权:Vercel cron 会带 Authorization: Bearer ${CRON_SECRET}
  if (!isCronAuthorized(req)) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  // 只在 A 股交易日生成(Tushare 交易日历,含节假日;不可用时回退周末判断)
  const date = todayISO();
  if (!(await isAshareTradingDay(date))) {
    return NextResponse.json({ ok: true, skipped: "non-trading-day", date });
  }

  // 幂等:当天已生成过就不重复
  const existing = await listBriefing({ date });
  if (existing.length > 0) {
    return NextResponse.json({
      ok: true,
      skipped: "already-exists",
      date,
      count: existing.length,
    });
  }

  try {
    const { drafts, engine, usMarketClosed } = await generateDrafts();
    // 美股休市(节假日):不硬拿旧数据生成隔夜映射,明说跳过
    if (usMarketClosed) {
      return NextResponse.json({ ok: true, date, skipped: "us-market-closed" });
    }
    // 方案 B:生成后直接发布上线
    const created = await insertDrafts(
      drafts.map((d) => ({ ...d, status: "published" as const }))
    );
    // 盘前推送:发布后,给有自选+有相关动态的用户推一条(同一 cron 内做,省一个 cron 额度)
    const digest = await runPreOpenDigest().catch(() => null);
    return NextResponse.json({
      ok: true,
      date,
      engine,
      published: created.length,
      digest,
    });
  } catch (e) {
    await alertCron("briefing(简报生成)", e);
    return NextResponse.json({ ok: false, error: String(e) }, { status: 500 });
  }
}
