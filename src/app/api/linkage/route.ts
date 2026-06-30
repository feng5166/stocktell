import { NextRequest, NextResponse } from "next/server";
import { unstable_cache } from "next/cache";
import { linkageStat, type LinkageStat } from "@/lib/linkage";
import { singleFlight } from "@/lib/single-flight";
import { todayISO } from "@/lib/date";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

// 联动有效率(边级、天内不变)。?pairs=NVDA:300308,NVDA:601138 → { "NVDA:300308": stat|null, ... }
// 按 边+日 缓存 6h(跨请求/实例),配单飞防冷窗口并发回源放大 Yahoo/Tushare。
const MAX_PAIRS = 12;

function cachedLinkage(us: string, a: string): Promise<LinkageStat | null> {
  return unstable_cache(
    () => singleFlight(`linkage:${us}:${a}`, () => linkageStat(us, a)),
    ["linkage", us, a, todayISO()],
    { revalidate: 21600 }
  )();
}

export async function GET(req: NextRequest) {
  const raw = req.nextUrl.searchParams.get("pairs") || "";
  const pairs = raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
    .slice(0, MAX_PAIRS)
    .map((p) => p.split(":"))
    .filter((kv): kv is [string, string] => kv.length === 2 && !!kv[0] && !!kv[1]);

  const entries = await Promise.all(
    pairs.map(async ([us, a]) => {
      const stat = await cachedLinkage(us, a).catch(() => null);
      return [`${us}:${a}`, stat] as const;
    })
  );
  return NextResponse.json({ ok: true, linkage: Object.fromEntries(entries) });
}
