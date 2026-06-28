import { NextRequest, NextResponse } from "next/server";
import { STOCK_MAP } from "@/data/stocks";
import { todayISO } from "@/lib/date";
import { moneyflowByDate, longhuByDate, latestFundYmd } from "@/lib/tushare";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

// 你的票·资金面:按自选里的 A 股,返回最新交易日的主力净流入 + 龙虎榜。
// body: { codes: string[] }。资金面是 A 股数据,美股自选忽略。
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const raw: string[] = Array.isArray(body.codes) ? body.codes : [];
  const aCodes = raw.filter(
    (c) => typeof c === "string" && STOCK_MAP[c]?.market === "A股"
  );
  if (aCodes.length === 0) {
    return NextResponse.json({ ok: true, date: null, items: [] });
  }

  const ymd = await latestFundYmd(todayISO());
  if (!ymd) return NextResponse.json({ ok: true, date: null, items: [] });

  const [mf, lh] = await Promise.all([
    moneyflowByDate(ymd),
    longhuByDate(ymd),
  ]);

  const items = aCodes.map((code) => ({
    code,
    name: STOCK_MAP[code].name,
    netMf: mf.get(code) ?? null, // 主力净流入(亿元)
    longhu: lh.get(code) ?? null, // { net, reason }
  }));

  const date = `${ymd.slice(0, 4)}-${ymd.slice(4, 6)}-${ymd.slice(6, 8)}`;
  return NextResponse.json({ ok: true, date, items });
}
