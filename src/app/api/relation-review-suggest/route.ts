import { NextRequest, NextResponse } from "next/server";
import { STOCK_MAP } from "@/data/stocks";
import { resolvePrimary } from "@/lib/relation-resolver";
import { upsertReviewItem } from "@/lib/relation-review";
import { todayISO } from "@/lib/date";

export const dynamic = "force-dynamic";

// Watchlist「提交复核」入口(2.1-W5):用户把自选里未覆盖/存疑的票推进 relationReviewQueue
// (source=manual,人工审阅台定夺)。写入面很窄:只收股票池内的 code、同 (code,chainId)
// 幂等去重(同日重复提交 no-op、reason 不变不加计数,见 lib/relation-review),滥用面可控。
// 不变量#4 仍成立:队列只是待办,收录/调档永远走 chain-relations.ts 代码评审。
export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => null)) as { code?: string } | null;
  const code = body?.code?.trim();
  if (!code || !STOCK_MAP[code]) {
    return NextResponse.json({ ok: false, error: "unknown-code" }, { status: 400 });
  }
  const rel = resolvePrimary(code);
  await upsertReviewItem({
    code,
    // 未覆盖票没有链身份,用 "unmapped" 作队列容器(审阅台可按此过滤"待收录"类)
    chainId: rel?.chainId ?? "unmapped",
    date: todayISO(),
    source: "manual",
    reason: rel
      ? `用户提交复核:现档 ${rel.relationType}(${rel.chainName}),请人工确认是否需调整`
      : `用户提交收录:自选中的未覆盖票,请评估是否纳入关系库(现无关系档)`,
  });
  return NextResponse.json({ ok: true });
}
