import { NextRequest, NextResponse } from "next/server";
import { withMetrics } from "@/lib/metrics";
import { STOCK_MAP } from "@/data/stocks";
import { financialCheckup } from "@/lib/financials";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// 和我相关·财报体检汇总:一组自选 code → 每只票的体检结论(按天缓存)。
export const POST = withMetrics("fin-checkup", _POST);
async function _POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const codes: string[] = Array.isArray(body.codes) ? body.codes : [];
  const valid = Array.from(new Set(codes.filter((c) => STOCK_MAP[c]?.market === "A股"))).slice(0, 40);
  const entries = await Promise.all(
    valid.map(async (c) => [c, await financialCheckup(c).catch(() => null)] as const)
  );
  const byCode: Record<string, unknown> = {};
  for (const [c, ck] of entries) if (ck && ck.findings.length) byCode[c] = ck;
  return NextResponse.json({ ok: true, byCode });
}
