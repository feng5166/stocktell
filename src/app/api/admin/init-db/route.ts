import { NextRequest, NextResponse } from "next/server";
import { getPrisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

// 一次性建 users 表(与 prisma User 对齐)。需 ?token=ADMIN_TOKEN。建完即删。
const USERS = `CREATE TABLE IF NOT EXISTS "users" (
  "id" text NOT NULL,
  "email" text,
  "password_hash" text,
  "nickname" text,
  "avatar" text,
  "created_at" timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "users_pkey" PRIMARY KEY ("id")
)`;
const USERS_EMAIL = `CREATE UNIQUE INDEX IF NOT EXISTS "users_email_key" ON "users" ("email")`;

export async function POST(req: NextRequest) {
  const token = req.nextUrl.searchParams.get("token");
  if (!process.env.ADMIN_TOKEN || token !== process.env.ADMIN_TOKEN) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }
  const db = getPrisma();
  if (!db) {
    return NextResponse.json({ ok: false, error: "no database" }, { status: 500 });
  }
  try {
    await db.$executeRawUnsafe(USERS);
    await db.$executeRawUnsafe(USERS_EMAIL);
    const count = await db.user.count();
    return NextResponse.json({ ok: true, message: "users ready", count });
  } catch (e) {
    return NextResponse.json({ ok: false, error: String(e) }, { status: 500 });
  }
}
