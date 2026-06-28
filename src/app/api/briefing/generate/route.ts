import { NextRequest, NextResponse } from "next/server";
import { generateDrafts } from "@/lib/generate";
import { insertDrafts } from "@/lib/briefings";
import { isAdminAuthorized } from "@/lib/api-guard";
import { isAdminSession } from "@/lib/admin";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(req: NextRequest) {
  const date = req.nextUrl.searchParams.get("date") || undefined; // YYYY-MM-DD,指定日期生成
  const dryRun = req.nextUrl.searchParams.get("dryRun") === "1"; // 预览:只返回不落库

  // 指定日期 / 预览 属管理操作(可用来演示节后累计口径),需管理员
  if ((date || dryRun) && !isAdminAuthorized(req) && !(await isAdminSession())) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  try {
    const { date: d, drafts, engine, usMarketClosed } = await generateDrafts({ date });
    if (dryRun) {
      return NextResponse.json({
        ok: true,
        date: d,
        engine,
        usMarketClosed,
        dryRun: true,
        count: drafts.length,
        items: drafts,
      });
    }
    const created = await insertDrafts(drafts);
    return NextResponse.json({
      ok: true,
      date: d,
      engine,
      usMarketClosed,
      count: created.length,
      items: created,
    });
  } catch (e) {
    return NextResponse.json({ ok: false, error: String(e) }, { status: 500 });
  }
}
