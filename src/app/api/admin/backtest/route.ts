import { NextRequest, NextResponse } from "next/server";
import { runBacktest, computeBacktestRows } from "@/lib/backtest";

export const dynamic = "force-dynamic";
export const maxDuration = 60; // 顺序拉历史 + 写库,给足时间

// 冷启动回测(明牌)。需 ?token=ADMIN_TOKEN。?days=20 可调窗口。
// ?dry=1:只拉取+计算返回 rows、不写库(给住宅 IP 本地跑,再把 rows POST 给 backtest-ingest)。
export async function POST(req: NextRequest) {
  const token = req.nextUrl.searchParams.get("token");
  if (!process.env.ADMIN_TOKEN || token !== process.env.ADMIN_TOKEN) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }
  const days = Number(req.nextUrl.searchParams.get("days")) || 20;
  const dry = req.nextUrl.searchParams.get("dry") === "1";
  try {
    return NextResponse.json(
      dry ? await computeBacktestRows(days) : await runBacktest(days)
    );
  } catch (e) {
    return NextResponse.json({ ok: false, error: String(e) }, { status: 500 });
  }
}
