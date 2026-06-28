import { NextRequest, NextResponse } from "next/server";
import { getPrisma } from "@/lib/prisma";

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

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const chain = typeof body.chain === "string" ? body.chain.slice(0, 40) : "";
  const voter = typeof body.voter === "string" ? body.voter.slice(0, 64) : "";
  if (!chain || !voter)
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
