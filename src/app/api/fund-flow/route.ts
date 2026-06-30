import { NextRequest, NextResponse } from "next/server";
import { withMetrics } from "@/lib/metrics";
import { fundFlowFor } from "@/lib/fund-flow";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

// 你的票·资金面:按自选里的 A 股,返回最新交易日主力净流入 + 龙虎榜 + 融资余额变化。
// body: { codes: string[] }。美股自选忽略(资金面是 A 股数据)。
export const POST = withMetrics("fund-flow", _POST);
async function _POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const codes: string[] = Array.isArray(body.codes) ? body.codes : [];
  const { date, items } = await fundFlowFor(codes);
  return NextResponse.json({ ok: true, date, items });
}
