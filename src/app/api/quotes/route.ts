import { NextRequest, NextResponse } from "next/server";
import { STOCK_MAP } from "@/data/stocks";
import { fetchQuotes } from "@/lib/quotes";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(req: NextRequest) {
  const param = req.nextUrl.searchParams.get("symbols");
  const codes = param
    ? param.split(",").filter((c) => STOCK_MAP[c])
    : Object.keys(STOCK_MAP);
  const { quotes, live } = await fetchQuotes(codes);
  return NextResponse.json({ quotes, live });
}
