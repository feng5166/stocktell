import { NextResponse } from "next/server";
import { fetchEtfQuotes } from "@/lib/quotes";
import { ETF_CODES } from "@/data/etfs";

export const dynamic = "force-dynamic";
export const revalidate = 0;

// 板块 ETF 实时行情(新浪)。盘后新浪仍返回最近收盘价,故基本常有数据;
// 取不到(新浪不可达)则返回空,前端显示"—"。
export async function GET() {
  const { quotes, live } = await fetchEtfQuotes(ETF_CODES);
  return NextResponse.json({ quotes, live });
}
