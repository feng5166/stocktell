import { NextRequest, NextResponse } from "next/server";
import { STOCK_MAP } from "@/data/stocks";
import { listBriefing, latestBriefing } from "@/lib/briefings";
import { todayISO } from "@/lib/date";
import { getMorningBrief } from "@/lib/morning-brief";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

// 网页「和我相关」顶部的个性化早报。客户端 POST 自选 codes(游客/登录通用)。
// 每日缓存在 getMorningBrief 内部(DB 全局:同一组自选 + 同一天只生成一次,不重复打 LLM)。
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const codes: string[] = Array.isArray(body.codes) ? body.codes : [];
  const set = new Set(codes.filter((c) => STOCK_MAP[c]));
  if (set.size === 0) return NextResponse.json({ brief: null, count: 0 });

  // 今天的简报;今天还没有就回退最近一期(与首页一致)
  const date = todayISO();
  let items = await listBriefing({ date, status: "published" }).catch(() => []);
  if (items.length === 0) {
    const latest = await latestBriefing().catch(() => ({ items: [] as typeof items }));
    items = latest.items;
  }
  const relevant = items.filter(
    (b) =>
      (b.triggerCode != null && set.has(b.triggerCode)) ||
      b.beneficiaries.some((x) => set.has(x.code))
  );
  if (relevant.length === 0) return NextResponse.json({ brief: null, count: 0 });

  const brief = await getMorningBrief(Array.from(set), relevant);
  return NextResponse.json({ brief, count: relevant.length });
}
