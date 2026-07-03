import { NextRequest, NextResponse } from "next/server";
import { generateDrafts } from "@/lib/generate";
import { insertDrafts } from "@/lib/briefings";
import { isAdminAuthorized } from "@/lib/api-guard";
import { isAdminSession } from "@/lib/admin";
import { getPrisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(req: NextRequest) {
  const date = req.nextUrl.searchParams.get("date") || undefined; // YYYY-MM-DD,指定日期生成
  const dryRun = req.nextUrl.searchParams.get("dryRun") === "1"; // 预览:只返回不落库
  const useLLM = req.nextUrl.searchParams.get("llm") === "1"; // 预览默认用模板(快);要 LLM 文案加 llm=1
  const replace = req.nextUrl.searchParams.get("replace") === "1"; // 重刷:删该日旧简报→新口径重生成并发布

  // 生成一律属管理操作(烧 LLM、写库)。此前不带参数的 POST 不鉴权,任何人可刷 draft
  // (2026-07-03 早上 07:54 出现过一批来路不明的 draft),现收紧:所有 POST 都要管理员。
  if (!isAdminAuthorized(req) && !(await isAdminSession())) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  try {
    // 预览默认走模板引擎(避免 LLM 慢撞 Hobby 60s 上限);正式生成仍用 LLM
    const { date: d, drafts, engine, usMarketClosed } = await generateDrafts({
      date,
      forceTemplate: dryRun && !useLLM,
    });
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

    // 重刷:先删该日旧简报(注意:今日简报尚无 outcome 记账,删除安全),再以发布态写入
    if (replace) {
      const db = getPrisma();
      if (db) await db.briefingItem.deleteMany({ where: { date: d } });
      const created = await insertDrafts(
        drafts.map((x) => ({ ...x, status: "published" as const }))
      );
      return NextResponse.json({ ok: true, date: d, engine, usMarketClosed, replaced: true, count: created.length });
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
