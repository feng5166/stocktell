import { NextResponse } from "next/server";
import { getPrisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

// 健康检查:供外部 uptime 探活(UptimeRobot/BetterStack 等)。检 DB 连通性。
// 不返回任何敏感信息;DB 不通返回 503,便于告警。
export async function GET() {
  const db = getPrisma();
  if (!db) return NextResponse.json({ ok: false, db: false }, { status: 503 });
  try {
    await db.$queryRaw`SELECT 1`;
    return NextResponse.json({ ok: true, db: true });
  } catch {
    return NextResponse.json({ ok: false, db: false }, { status: 503 });
  }
}
