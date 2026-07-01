import { NextRequest, NextResponse } from "next/server";
import { isCronAuthorized } from "@/lib/api-guard";

export const dynamic = "force-dynamic";
export const maxDuration = 90; // 要等主流程(生成+推送)跑完

// 补位:主简报 cron(07:00 北京)若漏触发 / 当时隔夜行情抓空,40 分钟后再戳一次主流程。
// 主流程幂等(当天已生成→跳过),所以主 cron 成功时这里是 no-op;漏了/抓空则由它补上并推送。
export async function GET(req: NextRequest) {
  if (!isCronAuthorized(req)) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }
  const base = process.env.NEXTAUTH_URL || "https://www.stocktell.me";
  const secret = process.env.CRON_SECRET || "";
  try {
    const r = await fetch(`${base}/api/cron/briefing`, {
      headers: { Authorization: `Bearer ${secret}` },
      cache: "no-store",
    });
    const primary = await r.json().catch(() => ({}));
    return NextResponse.json({ ok: true, backup: true, primary });
  } catch (e) {
    return NextResponse.json({ ok: false, error: String(e) }, { status: 500 });
  }
}
