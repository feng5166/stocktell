import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { getPrisma } from "@/lib/prisma";
import { STOCK_MAP } from "@/data/stocks";
import { resolvePrimary } from "@/lib/relation-resolver";

export const dynamic = "force-dynamic";

// 验证点跟踪·轻量版(2.3 P1-3)。登录用户落库;游客走 localStorage(client hook),
// 登录时经 merge 并入。point 必须来自该票核定关系档的 verificationPoints(白名单校验,
// 不接受用户自填文本——存储的是核定研究框架的引用,不是 UGC)。
async function uid(): Promise<string | null> {
  const session = await getServerSession(authOptions).catch(() => null);
  return session?.user?.id ?? null;
}

const validPoint = (code: string, point: string): boolean => {
  if (!STOCK_MAP[code] || point.length > 60) return false;
  const rel = resolvePrimary(code);
  return !!rel?.verificationPoints?.includes(point);
};

export async function GET() {
  const userId = await uid();
  if (!userId) return NextResponse.json({ ok: true, items: [] });
  const db = getPrisma();
  if (!db) return NextResponse.json({ ok: false, error: "unavailable" }, { status: 503 });
  const rows = await db.verifyFollow
    .findMany({ where: { userId }, select: { code: true, point: true } })
    .catch(() => []);
  return NextResponse.json({ ok: true, items: rows });
}

// POST { code, point } 切换;或 { merge: [{code,point}...] } 登录合并(非法项静默跳过)
export async function POST(req: NextRequest) {
  const userId = await uid();
  if (!userId) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  const db = getPrisma();
  if (!db) return NextResponse.json({ ok: false, error: "unavailable" }, { status: 503 });
  const body = (await req.json().catch(() => ({}))) as {
    code?: string;
    point?: string;
    merge?: Array<{ code?: string; point?: string }>;
  };

  if (Array.isArray(body.merge)) {
    const valid = body.merge
      .filter((m): m is { code: string; point: string } => !!m.code && !!m.point && validPoint(m.code, m.point))
      .slice(0, 50);
    if (valid.length) {
      await db.verifyFollow
        .createMany({ data: valid.map((m) => ({ userId, ...m })), skipDuplicates: true })
        .catch(() => {});
    }
    const rows = await db.verifyFollow
      .findMany({ where: { userId }, select: { code: true, point: true } })
      .catch(() => []);
    return NextResponse.json({ ok: true, items: rows });
  }

  const { code, point } = body;
  if (!code || !point || !validPoint(code, point))
    return NextResponse.json({ ok: false, error: "bad-point" }, { status: 400 });
  const existing = await db.verifyFollow
    .findUnique({ where: { userId_code_point: { userId, code, point } } })
    .catch(() => null);
  if (existing) {
    await db.verifyFollow.delete({ where: { id: existing.id } }).catch(() => {});
    return NextResponse.json({ ok: true, following: false });
  }
  await db.verifyFollow.create({ data: { userId, code, point } }).catch(() => {});
  return NextResponse.json({ ok: true, following: true });
}
