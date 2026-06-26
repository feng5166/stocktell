import { NextRequest, NextResponse } from "next/server";
import { runBacktest } from "@/lib/backtest";

export const dynamic = "force-dynamic";
export const maxDuration = 60; // 顺序拉历史 + 写库,给足时间

// 冷启动回测(明牌)。需 ?token=ADMIN_TOKEN。?days=20 可调窗口。
export async function POST(req: NextRequest) {
  const token = req.nextUrl.searchParams.get("token");
  if (!process.env.ADMIN_TOKEN || token !== process.env.ADMIN_TOKEN) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }
  const days = Number(req.nextUrl.searchParams.get("days")) || 20;
  try {
    return NextResponse.json(await runBacktest(days));
  } catch (e) {
    return NextResponse.json({ ok: false, error: String(e) }, { status: 500 });
  }
}
