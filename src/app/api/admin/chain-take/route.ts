import { NextRequest, NextResponse } from "next/server";
import { isAdminAuthorized } from "@/lib/api-guard";
import { isAdminSession } from "@/lib/admin";
import { listBriefing } from "@/lib/briefings";
import { generateChainTake, getChainTake } from "@/lib/chain-take";
import { todayISO } from "@/lib/date";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

// 链级「今日一句话判断」手动生成/重跑(cron 正常时无需碰)。
// POST /api/admin/chain-take?date=YYYY-MM-DD(默认今天)&chain=ai&force=1(覆盖重生成)
// GET  同参数:只读当前缓存,不生成。
export async function GET(req: NextRequest) {
  if (!isAdminAuthorized(req) && !(await isAdminSession())) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }
  const date = req.nextUrl.searchParams.get("date") ?? todayISO();
  const chain = req.nextUrl.searchParams.get("chain") ?? "ai";
  const take = await getChainTake(chain, date);
  return NextResponse.json({ ok: true, date, chain, take });
}

export async function POST(req: NextRequest) {
  if (!isAdminAuthorized(req) && !(await isAdminSession())) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }
  const date = req.nextUrl.searchParams.get("date") ?? todayISO();
  const chain = req.nextUrl.searchParams.get("chain") ?? "ai";
  const force = req.nextUrl.searchParams.get("force") === "1";
  const items = await listBriefing({ date, status: "published" }).catch(() => []);
  if (items.length === 0) {
    return NextResponse.json({ ok: false, error: "no-published-items", date });
  }
  const r = await generateChainTake(chain, date, items, { force });
  return NextResponse.json({ ok: r.take != null, date, chain, ...r });
}
