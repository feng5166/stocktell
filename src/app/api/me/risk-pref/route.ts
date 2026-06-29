import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { getPrisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

// 雷区提醒偏好(risk_opt_out 反向 = enabled)。
export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  const db = getPrisma();
  if (!db) return NextResponse.json({ ok: true, enabled: true });
  const u = await db.user.findUnique({
    where: { id: session.user.id },
    select: { riskOptOut: true },
  });
  return NextResponse.json({ ok: true, enabled: !(u?.riskOptOut ?? false) });
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  const db = getPrisma();
  if (!db) return NextResponse.json({ ok: false, error: "no-db" }, { status: 500 });
  const body = await req.json().catch(() => ({}));
  const enabled = !!body.enabled;
  await db.user.update({ where: { id: session.user.id }, data: { riskOptOut: !enabled } });
  return NextResponse.json({ ok: true, enabled });
}
