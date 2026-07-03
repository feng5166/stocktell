import { NextRequest, NextResponse } from "next/server";
import { isAdminAuthorized } from "@/lib/api-guard";
import { isAdminSession } from "@/lib/admin";
import { getPrisma } from "@/lib/prisma";
import { todayISO } from "@/lib/date";

export const dynamic = "force-dynamic";

// 只读排障:查某日「你的今日早报」缓存(morning_brief_cache)的生成时间与正文。
// 用途:早报内容陈旧/方向不对时,确认这份缓存是几点、按哪期条目写入的。
// (历史背景:v3 及之前 key 按 todayISO(),00:00~07:00 首页回退期访问会把昨日内容
//  缓存到今天的 key——2026-07-03 事故#2;v4 起 key 改用条目自身日期,该路径已堵死,
//  本端点保留 v3 前缀查询仅为翻旧账。)
// GET /api/admin/brief-cache?date=YYYY-MM-DD(默认今天)&full=1(返回全文)
export async function GET(req: NextRequest) {
  if (!isAdminAuthorized(req) && !(await isAdminSession())) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }
  const db = getPrisma();
  if (!db) return NextResponse.json({ ok: false, error: "no-db" }, { status: 500 });

  const date = req.nextUrl.searchParams.get("date") ?? todayISO();
  // 严格 YYYY-MM-DD:date 直接进 LIKE 查询,%/_ 会变通配符(date=%25 → 拉全表正文)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return NextResponse.json(
      { ok: false, error: "date 必须是 YYYY-MM-DD" },
      { status: 400 }
    );
  }
  const full = req.nextUrl.searchParams.get("full") === "1";
  // 早报 key(v3~v5:{date}:hash)锚定前缀匹配——同表还有 chaintake:{date}: 家族,混着数会
  // 污染"当日几点写入几条"的取证判读,所以链级判断单独一个字段返回(排链页问题也用得上)。
  const trim = (r: { key: string; updatedAt: Date; brief: string }) => ({
    key: r.key,
    updatedAt: r.updatedAt,
    brief: full ? r.brief : r.brief.slice(0, 200),
  });
  const rows = await db.morningBriefCache.findMany({
    where: {
      OR: [
        { key: { startsWith: `v5:${date}:` } },
        { key: { startsWith: `v4:${date}:` } },
        { key: { startsWith: `v3:${date}:` } },
      ],
    },
    orderBy: { updatedAt: "asc" },
  });
  const chaintake = await db.morningBriefCache.findMany({
    where: { key: { startsWith: `chaintake:${date}:` } },
    orderBy: { updatedAt: "asc" },
  });
  return NextResponse.json({
    ok: true,
    date,
    count: rows.length,
    items: rows.map(trim),
    chaintake: chaintake.map(trim),
  });
}
