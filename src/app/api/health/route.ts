import { NextResponse } from "next/server";
import { getPrisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

// 健康检查:供外部 uptime 探活(UptimeRobot/BetterStack 等)。检 DB 连通性。
// 不返回敏感信息;DB 不通返回 503,便于告警。version=当前上线 commit(Vercel 构建注入),
// 用于确认"线上是哪个提交、部署有没有跟上",非敏感(本就公开在部署里)。
const version = {
  commit: process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) ?? "local",
  ref: process.env.VERCEL_GIT_COMMIT_REF ?? null,
  region: process.env.VERCEL_REGION ?? null,
  env: process.env.VERCEL_ENV ?? null,
};

export async function GET() {
  const db = getPrisma();
  if (!db) return NextResponse.json({ ok: false, db: false, version }, { status: 503 });
  try {
    await db.$queryRaw`SELECT 1`;
    return NextResponse.json({ ok: true, db: true, version });
  } catch {
    return NextResponse.json({ ok: false, db: false, version }, { status: 503 });
  }
}
