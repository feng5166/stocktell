import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { withMetrics } from "@/lib/metrics";
import { fetchFundamental } from "@/lib/tushare";
import { singleFlight } from "@/lib/single-flight";
import { getPrisma } from "@/lib/prisma";
import { todayISO } from "@/lib/date";
import { alertThrottled } from "@/lib/monitor";

export const dynamic = "force-dynamic";

// 基本面(daily_basic)天内基本不变。用 DB 跨实例缓存(quotes_cache,id=fund:code:当天)——
// 原来的 unstable_cache 在 Vercel 不跨实例持久,每个冷实例都重拉 Tushare,撞 Tushare 慢时
// 详情页基本面骨架会长时间空转(2026-07-01 用户反馈"拿不到")。改后:命中即秒回、省额度;
// 失败(抛错/空)不写缓存,避免把瞬时抖动的 null 毒化进当天缓存。单飞:同实例并发只回源一次。
async function cachedFundamental(code: string) {
  const id = `fund:${code}:${todayISO()}`;
  const db = getPrisma();
  if (db) {
    const row = await db.quotesCache
      .findUnique({ where: { id }, select: { data: true } })
      .catch(() => null);
    if (row?.data) return row.data;
  }
  let f: Awaited<ReturnType<typeof fetchFundamental>>;
  try {
    f = await singleFlight(`fundamental:${code}`, () => fetchFundamental(code));
  } catch (e) {
    // 真失败(Tushare 报错/超时)才告警;null(这只票本就无 daily_basic)不算失败、不报。
    await alertThrottled(
      "fetch-fail:fundamentals",
      `⚠️ StockTell 基本面获取失败(Tushare)| code=${code}\n${
        e instanceof Error ? e.message : String(e)
      }`
    );
    return null;
  }
  if (db && f) {
    await db.quotesCache
      .upsert({
        where: { id },
        create: { id, data: f as unknown as Prisma.InputJsonValue },
        update: { data: f as unknown as Prisma.InputJsonValue },
      })
      .catch(() => {});
  }
  return f;
}

export const GET = withMetrics("fundamentals", _GET);
async function _GET(req: NextRequest) {
  const code = req.nextUrl.searchParams.get("code");
  if (!code) return NextResponse.json({ ok: false, error: "缺少 code" }, { status: 400 });
  const f = await cachedFundamental(code);
  return NextResponse.json({ ok: true, fundamental: f });
}
