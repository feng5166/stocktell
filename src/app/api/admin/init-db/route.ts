import { NextRequest, NextResponse } from "next/server";
import { getPrisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

// 一次性建表(与 prisma/schema.prisma 的 BriefingItem 对齐)。需 ?token=ADMIN_TOKEN。
const DDL = `CREATE TABLE IF NOT EXISTS "briefing_items" (
  "id" text NOT NULL,
  "date" text NOT NULL,
  "impact" text NOT NULL,
  "title" text NOT NULL,
  "trigger_code" text,
  "trigger_name" text,
  "beneficiaries" jsonb NOT NULL DEFAULT '[]',
  "retail_take" text NOT NULL,
  "source_url" text,
  "status" text NOT NULL DEFAULT 'draft',
  "created_at" timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "briefing_items_pkey" PRIMARY KEY ("id")
)`;
const IDX = `CREATE INDEX IF NOT EXISTS "briefing_items_date_status_idx" ON "briefing_items" ("date","status")`;

export async function POST(req: NextRequest) {
  const token = req.nextUrl.searchParams.get("token");
  if (!process.env.ADMIN_TOKEN || token !== process.env.ADMIN_TOKEN) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }
  const db = getPrisma();
  if (!db) {
    return NextResponse.json(
      { ok: false, error: "no database (POSTGRES_PRISMA_URL missing)" },
      { status: 500 }
    );
  }
  try {
    await db.$executeRawUnsafe(DDL);
    await db.$executeRawUnsafe(IDX);
    const count = await db.briefingItem.count();
    return NextResponse.json({ ok: true, message: "briefing_items ready", count });
  } catch (e) {
    return NextResponse.json({ ok: false, error: String(e) }, { status: 500 });
  }
}
