import { NextRequest, NextResponse } from "next/server";
import { getPrisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

// 一次性建 password_reset_tokens 表。需 ?token=ADMIN_TOKEN。建完即删。
const T = `CREATE TABLE IF NOT EXISTS "password_reset_tokens" (
  "id" text NOT NULL,
  "email" text NOT NULL,
  "token" text NOT NULL,
  "used" boolean NOT NULL DEFAULT false,
  "expires_at" timestamp(3) NOT NULL,
  "created_at" timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "password_reset_tokens_pkey" PRIMARY KEY ("id")
)`;
const IDX_TOKEN = `CREATE UNIQUE INDEX IF NOT EXISTS "password_reset_tokens_token_key" ON "password_reset_tokens" ("token")`;
const IDX_EMAIL = `CREATE INDEX IF NOT EXISTS "password_reset_tokens_email_idx" ON "password_reset_tokens" ("email")`;

// 简报记账:给 briefing_items 加 trigger_change 列 + 建 briefing_outcomes 表(幂等)
const ALTER_BRIEFING = `ALTER TABLE "briefing_items" ADD COLUMN IF NOT EXISTS "trigger_change" double precision`;
const T_OUTCOME = `CREATE TABLE IF NOT EXISTS "briefing_outcomes" (
  "id" text NOT NULL,
  "briefing_id" text NOT NULL,
  "date" text NOT NULL,
  "title" text NOT NULL,
  "impact" text NOT NULL,
  "code" text NOT NULL,
  "name" text NOT NULL,
  "expected" text NOT NULL,
  "change" double precision,
  "hit" boolean,
  "evaluated_at" timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "briefing_outcomes_pkey" PRIMARY KEY ("id")
)`;
const IDX_OUTCOME_UNIQUE = `CREATE UNIQUE INDEX IF NOT EXISTS "briefing_outcomes_briefing_id_code_key" ON "briefing_outcomes" ("briefing_id", "code")`;
const IDX_OUTCOME_DATE = `CREATE INDEX IF NOT EXISTS "briefing_outcomes_date_idx" ON "briefing_outcomes" ("date")`;

export async function POST(req: NextRequest) {
  const token = req.nextUrl.searchParams.get("token");
  if (!process.env.ADMIN_TOKEN || token !== process.env.ADMIN_TOKEN) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }
  const db = getPrisma();
  if (!db) return NextResponse.json({ ok: false, error: "no database" }, { status: 500 });
  try {
    await db.$executeRawUnsafe(T);
    await db.$executeRawUnsafe(IDX_TOKEN);
    await db.$executeRawUnsafe(IDX_EMAIL);
    await db.$executeRawUnsafe(ALTER_BRIEFING);
    await db.$executeRawUnsafe(T_OUTCOME);
    await db.$executeRawUnsafe(IDX_OUTCOME_UNIQUE);
    await db.$executeRawUnsafe(IDX_OUTCOME_DATE);
    const count = await db.passwordResetToken.count();
    return NextResponse.json({
      ok: true,
      message: "password_reset_tokens + briefing_outcomes + trigger_change ready",
      count,
    });
  } catch (e) {
    return NextResponse.json({ ok: false, error: String(e) }, { status: 500 });
  }
}
