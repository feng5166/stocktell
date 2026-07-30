import { NextRequest, NextResponse } from "next/server";
import { getPrisma } from "@/lib/prisma";
import { rateLimit, clientIp } from "@/lib/rate-limit";
import { VOTE_CHAIN_KEYS } from "@/data/vote-chains";

export const dynamic = "force-dynamic";

// 其他产业链「我想要」投票:GET 取各链票数,POST 记一票(chain+voter 去重)。
export async function GET() {
  const db = getPrisma();
  if (!db) return NextResponse.json({ counts: {} });
  try {
    const rows = await db.chainInterest.groupBy({
      by: ["chain"],
      _count: { chain: true },
    });
    const counts: Record<string, number> = {};
    for (const r of rows) counts[r.chain] = r._count.chain;
    return NextResponse.json({ counts });
  } catch {
    return NextResponse.json({ counts: {} });
  }
}

// 公开写端点三道闸(2026-07-30 review,对齐 relation-review-suggest 的姿态):
// ①per-IP 限流(serverless 多实例下是弱限流,数据卫生面非权限面,够用)
// ②chain 必须在 VOTE_CHAIN_KEYS 白名单内(计数是排产优先级输入,不收自由字符串)
// ③voter 收敛为 clientId() 的字母数字格式 —— 去重仍靠 chain+voter 唯一键,
//   随机 voter 刷票的成本由 ① 抬高;真要一人一票需登录态,现阶段需求收集不值得加门槛。
const LIMIT = 12; // 6 条链 × 2,正常用户全投一遍也不会撞
const WINDOW_MS = 60 * 60 * 1000;
const VOTER_RE = /^[a-z0-9]{8,64}$/i;

export async function POST(req: NextRequest) {
  const ip = clientIp(req.headers);
  const rl = rateLimit(`chain-vote:${ip}`, LIMIT, WINDOW_MS);
  if (!rl.ok) {
    return NextResponse.json({ ok: false, error: "rate-limited" }, { status: 429 });
  }
  const body = await req.json().catch(() => ({}));
  const chain = typeof body.chain === "string" ? body.chain.slice(0, 40) : "";
  const voter = typeof body.voter === "string" ? body.voter.slice(0, 64) : "";
  if (!VOTE_CHAIN_KEYS.has(chain) || !VOTER_RE.test(voter))
    return NextResponse.json({ ok: false, error: "bad request" }, { status: 400 });
  const db = getPrisma();
  if (!db) return NextResponse.json({ ok: false });
  try {
    await db.chainInterest.upsert({
      where: { chain_voter: { chain, voter } },
      create: { chain, voter },
      update: {},
    });
    const count = await db.chainInterest.count({ where: { chain } });
    return NextResponse.json({ ok: true, chain, count });
  } catch {
    return NextResponse.json({ ok: false });
  }
}
