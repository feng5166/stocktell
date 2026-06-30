import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { withMetrics } from "@/lib/metrics";
import { linkageStat, type LinkageStat } from "@/lib/linkage";
import { singleFlight } from "@/lib/single-flight";
import { getPrisma } from "@/lib/prisma";
import { todayISO } from "@/lib/date";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

// 联动有效率(边级、天内不变)。?pairs=NVDA:300308,NVDA:601138 → { "NVDA:300308": stat|null, ... }
// 按 边+日 落 DB 缓存(复用 quotes_cache,跨实例持久 —— 原 unstable_cache 不跨实例,
// 每个冷实例都重算 = 拉 Yahoo 2年 + Tushare 2年日线,曾告警 22s)。配单飞防冷窗口并发回源。
const MAX_PAIRS = 12;
const LK_TIMEOUT_MS = 12000;

const withTimeout = <T>(p: Promise<T>, ms: number): Promise<T> =>
  Promise.race([
    p,
    new Promise<T>((_, rej) => setTimeout(() => rej(new Error("timeout")), ms)),
  ]);

// 合法 null(该对历史上无联动样本)用哨兵缓存,避免每次重算"无数据"对;失败(超时/源挂)不缓存。
async function cachedLinkage(us: string, a: string): Promise<LinkageStat | null> {
  const id = `lk:${us}:${a}:${todayISO()}`;
  const db = getPrisma();
  if (db) {
    const row = await db.quotesCache.findUnique({ where: { id } }).catch(() => null);
    if (row?.data) {
      const v = row.data as Record<string, unknown>;
      return v.__empty ? null : (v as unknown as LinkageStat);
    }
  }
  let stat: LinkageStat | null;
  try {
    stat = await singleFlight(`linkage:${us}:${a}`, () =>
      withTimeout(linkageStat(us, a), LK_TIMEOUT_MS)
    );
  } catch {
    return null; // 超时/源故障:不缓存,下次重试
  }
  if (db) {
    const data = (stat ?? { __empty: true }) as unknown as Prisma.InputJsonValue;
    await db.quotesCache
      .upsert({ where: { id }, create: { id, data }, update: { data } })
      .catch(() => {});
  }
  return stat;
}

export const GET = withMetrics("linkage", _GET);
async function _GET(req: NextRequest) {
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
