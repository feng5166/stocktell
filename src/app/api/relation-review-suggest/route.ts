import { NextRequest, NextResponse } from "next/server";
import { STOCK_MAP } from "@/data/stocks";
import { resolvePrimary } from "@/lib/relation-resolver";
import { upsertReviewItem } from "@/lib/relation-review";
import { todayISO } from "@/lib/date";
import { rateLimit, clientIp } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

// 三轮 review T2 + 四轮清理②:公开写端点必须有闸,限流用仓库现成 lib/rate-limit
// (自带 sweep,不再手写常驻内存桶)。防线四层:
// ①per-IP 限流(10 次/小时;serverless 多实例下是弱限流,配合②③④足够:数据卫生面非权限面)
// ②只收股票池内 code(全池 ~200,注入面有限)③lib 层按源分账(manual 是独立行,
//   绝不可能改写 feeder 证据,见 relation-review.ts V1)④队列条目上限 200(list take)。
const LIMIT = 10;
const WINDOW_MS = 60 * 60 * 1000;

// Watchlist「提交复核」入口(2.1-W5):用户把自选里未覆盖/存疑的票推进 relationReviewQueue
// (source=manual,人工审阅台定夺)。不变量#4 仍成立:队列只是待办,收录/调档永远走
// chain-relations.ts 代码评审。
export async function POST(req: NextRequest) {
  const ip = clientIp(req.headers);
  const rl = rateLimit(`review-suggest:${ip}`, LIMIT, WINDOW_MS);
  if (!rl.ok) {
    return NextResponse.json({ ok: false, error: "rate-limited" }, { status: 429 });
  }
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
