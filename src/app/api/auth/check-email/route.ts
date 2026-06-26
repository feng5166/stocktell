import { NextRequest, NextResponse } from "next/server";
import { getPrisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const db = getPrisma();
  if (!db) return NextResponse.json({ exists: false });
  const { email } = await req.json();
  if (!email) return NextResponse.json({ error: "缺少 email" }, { status: 400 });
  const user = await db.user.findUnique({
    where: { email: String(email).toLowerCase().trim() },
  });
  return NextResponse.json({ exists: !!user });
}
