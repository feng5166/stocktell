import { NextRequest, NextResponse } from "next/server";
import { similarityFor } from "@/lib/similarity";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

// 历史相似性:某 A 股 vs 其主关联美股的历史统计。?code=六位A股代码。
export async function GET(req: NextRequest) {
  const code = req.nextUrl.searchParams.get("code") || "";
  const result = await similarityFor(code).catch(() => null);
  return NextResponse.json({ ok: true, result });
}
