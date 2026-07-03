import { NextRequest, NextResponse } from "next/server";
import { isAdminAuthorized } from "@/lib/api-guard";
import { isAdminSession } from "@/lib/admin";
import { todayISO } from "@/lib/date";
import { generateDailyInsight } from "@/lib/insight-pipeline/generate";
import { saveDraft, hasDaily, getPrevHeat, resumePipeline } from "@/lib/insight-pipeline/docs";
import { getChain } from "@/data/chains";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

// 手动生成/重跑链级每日推理(PRD §5;人工强制也是事件专篇触发方式之一——增补#1)。
// POST /api/admin/insight-daily?date=YYYY-MM-DD(默认今天)&chain=ai&force=1
// force=1 时即使当日已有 draft/published 也重新生成一份新 draft(published 不受影响,人审替换)。
export async function POST(req: NextRequest) {
  if (!isAdminAuthorized(req) && !(await isAdminSession())) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }
  const date = req.nextUrl.searchParams.get("date") ?? todayISO();
  const chainId = req.nextUrl.searchParams.get("chain") ?? "ai";
  const force = req.nextUrl.searchParams.get("force") === "1";

  const chain = getChain(chainId);
  if (!chain?.segments?.length) {
    return NextResponse.json({ ok: false, error: "chain-not-configured" }, { status: 400 });
  }
  if (!force && (await hasDaily(chainId, date))) {
    return NextResponse.json({ ok: true, skipped: "already-exists", date, chainId });
  }
  // 手动 force = 人工确认,顺带解除同图谱暂停(§7.2-6 恢复路径)
  if (force) await resumePipeline(chainId).catch(() => {});
  const prevHeat = await getPrevHeat(chainId, date).catch(() => null);
  const r = await generateDailyInsight(chainId, date, { yesterdayHeat: prevHeat });
  if (!r.ok) return NextResponse.json({ ok: false, error: r.reason, date, chainId });
  if (r.blocked) {
    return NextResponse.json({
      ok: false,
      blocked: true,
      blockers: r.guard!.blockers,
      detail: r.guard!.detail,
    });
  }
  const doc = await saveDraft(r.payload!, r.guard!);
  return NextResponse.json({
    ok: true,
    date,
    chainId,
    docId: doc?.id ?? null,
    slug: doc?.slug ?? null,
    warnings: r.guard!.warnings,
    judgmentPreview: r.payload!.judgment.slice(0, 60),
  });
}
