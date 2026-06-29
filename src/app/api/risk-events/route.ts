import { NextRequest, NextResponse } from "next/server";
import { STOCK_MAP } from "@/data/stocks";
import { riskEventsFor } from "@/lib/risk-radar";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

// 和我相关汇总用:给一组自选 code,返回每只票的雷区事件(已按天缓存)。
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const codes: string[] = Array.isArray(body.codes) ? body.codes : [];
  const valid = Array.from(new Set(codes.filter((c) => STOCK_MAP[c]?.market === "A股"))).slice(0, 60);
  const entries = await Promise.all(
    valid.map(async (c) => [c, await riskEventsFor(c).catch(() => [])] as const)
  );
  const byCode: Record<string, unknown> = {};
  for (const [c, evs] of entries) if (evs.length) byCode[c] = evs;
  return NextResponse.json({ ok: true, byCode });
}
