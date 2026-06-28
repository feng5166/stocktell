import { NextResponse } from "next/server";
import { chainSentiment } from "@/lib/sentiment";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

// AI 链情绪仪表盘:A 股整体涨跌 + 主力净流入 + 隔夜美股情绪。
export async function GET() {
  const data = await chainSentiment().catch(() => ({ date: null, a: null, us: null }));
  return NextResponse.json({ ok: true, ...data });
}
