import { NextRequest, NextResponse } from "next/server";
import { fetchFundamental } from "@/lib/tushare";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const code = req.nextUrl.searchParams.get("code");
  if (!code) return NextResponse.json({ ok: false, error: "缺少 code" }, { status: 400 });
  try {
    const f = await fetchFundamental(code);
    return NextResponse.json({ ok: true, fundamental: f });
  } catch (e) {
    return NextResponse.json({ ok: true, fundamental: null, error: String(e) });
  }
}
