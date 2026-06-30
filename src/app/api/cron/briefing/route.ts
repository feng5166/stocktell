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
    // 美股休市(节假日):不硬拿旧数据生成隔夜映射,明说跳过。
    // 但交易日早上判到"美股休市"多半是行情源抖动导致 asOf 陈旧的误判 → 告警(别静默),
    // 真节假日时这条告警当 FYI,但一年没几次,值得人眼扫一下确认。
    if (usMarketClosed) {
      await alertCron(
        "briefing(简报生成)",
        `交易日 ${date} 判定"美股休市"跳过 —— 若非美股真节假日,多半是 07:00 美股行情源抖动致 asOf 陈旧的误判,需手动重发(/api/admin… 或 generate?replace=1)`
      );
      return NextResponse.json({ ok: true, date, skipped: "us-market-closed" });
    }
    // 方案 B:生成后直接发布上线
    const created = await insertDrafts(
      drafts.map((d) => ({ ...d, status: "published" as const }))
    );
    // 交易日却 0 条发布:movers 为空(美股行情抓取失败/陈旧)等静默失败 → 告警,别让它无声过去。
    // (此前 2026-06-29 早盘正是走到这类静默 0 条,导致整天没简报/没推送/查账缺一天。)
    if (created.length === 0) {
      await alertCron(
        "briefing(简报生成)",
        `交易日 ${date} 生成 0 条简报(movers 为空,疑似美股行情抓取失败/陈旧)—— 需手动重发`
      );
    }
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
