import { NextRequest, NextResponse } from "next/server";
import { isAdminAuthorized } from "@/lib/api-guard";
import { isAdminSession } from "@/lib/admin";
import { getPrisma } from "@/lib/prisma";
import { todayISO } from "@/lib/date";

export const dynamic = "force-dynamic";

// 只读排障:查某日「你的今日早报」缓存(morning_brief_cache)的生成时间与正文。
// 用途:早报内容陈旧/方向不对时,确认这份缓存是几点写入的(如 07:00 前访问首页,
// 会拿昨日回退简报生成早报并缓存到今天的 key)。
// GET /api/admin/brief-cache?date=YYYY-MM-DD(默认今天)&full=1(返回全文)
export async function GET(req: NextRequest) {
  if (!isAdminAuthorized(req) && !(await isAdminSession())) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }
  const db = getPrisma();
  if (!db) return NextResponse.json({ ok: false, error: "no-db" }, { status: 500 });

  const date = req.nextUrl.searchParams.get("date") ?? todayISO();
  const full = req.nextUrl.searchParams.get("full") === "1";
  const rows = await db.morningBriefCache.findMany({
    where: { key: { startsWith: `v3:${date}:` } },
    orderBy: { updatedAt: "asc" },
  });
  return NextResponse.json({
    ok: true,
    date,
    count: rows.length,
    items: rows.map((r) => ({
      key: r.key,
      updatedAt: r.updatedAt,
      brief: full ? r.brief : r.brief.slice(0, 200),
    })),
  });
}
