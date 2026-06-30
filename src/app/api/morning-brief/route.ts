import { NextRequest, NextResponse } from "next/server";
import { withMetrics } from "@/lib/metrics";
import { STOCK_MAP } from "@/data/stocks";
import { getMorningBrief } from "@/lib/morning-brief";
import type { BriefingItem } from "@/lib/briefings";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

// 网页「和我相关」顶部的个性化早报。
// 前端传自选 codes + 它本来就有的相关简报条目(items),服务端不再重查简报。
// 缓存(getMorningBrief 内,key=当天+自选组合)命中时直接秒回,不打 LLM、不查库。
export const POST = withMetrics("morning-brief", _POST);
async function _POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const codes: string[] = Array.isArray(body.codes) ? body.codes : [];
  const set = new Set(codes.filter((c) => STOCK_MAP[c]));
  const items: BriefingItem[] = Array.isArray(body.items) ? body.items : [];
  // 信任公开简报数据,只挡明显脏数据
  const relevant = items.filter((it) => it && typeof it.title === "string");
  if (set.size === 0 || relevant.length === 0)
    return NextResponse.json({ brief: null, count: 0 });

  const brief = await getMorningBrief(Array.from(set), relevant);
  return NextResponse.json({ brief, count: relevant.length });
}
