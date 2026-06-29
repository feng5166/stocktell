import { NextRequest, NextResponse } from "next/server";
import { STOCK_MAP } from "@/data/stocks";
import { ETF_HOLDINGS } from "@/data/etf-holdings.generated";

export const dynamic = "force-dynamic";

// 你的票·ETF 一篮子:聚合自选 → 哪些 ETF 覆盖你最多自选,各覆盖了你哪几只(读静态反查索引,极快)。
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const codes: string[] = Array.isArray(body.codes) ? body.codes : [];
  const valid = Array.from(new Set(codes.filter((c) => STOCK_MAP[c]?.market === "A股")));
  // 按 ETF 名称(指数)聚合:不同基金公司同名(如多只"创业板人工智能ETF")合并成一条,
  // 代码取代表;同一自选在同名 ETF 下只计一次(取占比最高)。
  const map = new Map<string, { code: string; name: string; stocks: Map<string, { code: string; name: string; ratio: number }> }>();
  for (const code of valid) {
    for (const e of ETF_HOLDINGS[code] ?? []) {
      const m = map.get(e.name) ?? { code: e.code, name: e.name, stocks: new Map() };
      const prev = m.stocks.get(code);
      if (!prev || e.ratio > prev.ratio)
        m.stocks.set(code, { code, name: STOCK_MAP[code]?.name ?? code, ratio: e.ratio });
      map.set(e.name, m);
    }
  }
  const etfs = Array.from(map.values())
    .map((m) => ({
      code: m.code,
      name: m.name,
      stocks: Array.from(m.stocks.values()).sort((a, b) => b.ratio - a.ratio),
    }))
    .sort((a, b) => b.stocks.length - a.stocks.length || b.stocks[0].ratio - a.stocks[0].ratio)
    .slice(0, 8);
  return NextResponse.json({ ok: true, etfs });
}
