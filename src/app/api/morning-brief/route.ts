import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { STOCK_MAP } from "@/data/stocks";
import { listBriefing, latestBriefing } from "@/lib/briefings";
import { todayISO } from "@/lib/date";
import { buildMorningBrief } from "@/lib/morning-brief";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

// 网页「和我相关」顶部的个性化早报。客户端 POST 自选 codes(游客/登录通用)。
// 进程内缓存:同一组自选 + 同一天复用,避免每次打开都打 LLM。
const cache = new Map<string, { brief: string | null; count: number; at: number }>();
const TTL = 30 * 60 * 1000; // 30 分钟

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const codes: string[] = Array.isArray(body.codes) ? body.codes : [];
  const set = new Set(codes.filter((c) => STOCK_MAP[c]));
  if (set.size === 0) return NextResponse.json({ brief: null, count: 0 });

  const date = todayISO();
  const key = `${date}|${Array.from(set).sort().join(",")}`;
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < TTL) {
    return NextResponse.json({ brief: hit.brief, count: hit.count });
  }

  // 今天的简报;今天还没有就回退最近一期(与首页一致)
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
  if (relevant.length === 0) {
    cache.set(key, { brief: null, count: 0, at: Date.now() });
    return NextResponse.json({ brief: null, count: 0 });
  }

  const session = await getServerSession(authOptions);
  const nickname = session?.user?.name ?? null;
  const brief = await buildMorningBrief(nickname, relevant);
  cache.set(key, { brief, count: relevant.length, at: Date.now() });
  return NextResponse.json({ brief, count: relevant.length });
}
