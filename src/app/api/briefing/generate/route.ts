import { NextResponse } from "next/server";
import { generateDrafts } from "@/lib/generate";
import { insertDrafts } from "@/lib/briefings";

export const dynamic = "force-dynamic";

export async function POST() {
  try {
    const { date, drafts, engine, usMarketClosed } = await generateDrafts();
    const created = await insertDrafts(drafts);
    return NextResponse.json({
      ok: true,
      date,
      engine,
      usMarketClosed,
      count: created.length,
      items: created,
    });
  } catch (e) {
    return NextResponse.json({ ok: false, error: String(e) }, { status: 500 });
  }
}
