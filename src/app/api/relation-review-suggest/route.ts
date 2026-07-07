import { NextRequest, NextResponse } from "next/server";
import { STOCK_MAP } from "@/data/stocks";
import { resolvePrimary } from "@/lib/relation-resolver";
import { upsertReviewItem } from "@/lib/relation-review";
import { todayISO } from "@/lib/date";

export const dynamic = "force-dynamic";

// 三轮 review T2:公开写端点必须有闸。防线四层:
// ①per-IP 限流(每实例内存桶,10 次/小时——正常用户一天点不了几次,脚本刷会被掐;
//   serverless 多实例下是弱限流,但配合②③④足够:这不是钱/权限面,是数据卫生面)
// ②只收股票池内 code(全池 ~200,注入面有限)③lib 层同日同源幂等+跨源不覆盖 reason
// (队列证据链不可被 manual 流量改写,见 relation-review.ts)④队列条目上限 200(list take)。
const BUCKET = new Map<string, { count: number; resetAt: number }>();
const LIMIT = 10;
const WINDOW_MS = 60 * 60 * 1000;
function rateLimited(ip: string): boolean {
  const now = Date.now();
  const b = BUCKET.get(ip);
  if (!b || now > b.resetAt) {
    BUCKET.set(ip, { count: 1, resetAt: now + WINDOW_MS });
    return false;
  }
  b.count++;
  return b.count > LIMIT;
}

// Watchlist「提交复核」入口(2.1-W5):用户把自选里未覆盖/存疑的票推进 relationReviewQueue
// (source=manual,人工审阅台定夺)。不变量#4 仍成立:队列只是待办,收录/调档永远走
// chain-relations.ts 代码评审。
export async function POST(req: NextRequest) {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  if (rateLimited(ip)) {
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
