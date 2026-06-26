import { NextRequest, NextResponse } from "next/server";
import { STOCK_MAP } from "@/data/stocks";
import { explainMove } from "@/lib/why";

export const dynamic = "force-dynamic";
export const maxDuration = 60; // 冷启动 + 博查检索 + LLM 总结,留足余量避免超时

// 按需"为什么动":仅前端在「和我相关」卡片上对命中自选的触发标的调用。
// 未开启检索时统一返回 reason:null,前端不显示,绝不编因果。
export async function GET(req: NextRequest) {
  const code = req.nextUrl.searchParams.get("code") || "";
  const date = req.nextUrl.searchParams.get("date") || "";
  const s = STOCK_MAP[code];
  if (!s) return NextResponse.json({ ok: true, reason: null, asOf: null });
  const r = await explainMove(s.name, s.code, date);
  return NextResponse.json({ ok: true, ...r });
}
