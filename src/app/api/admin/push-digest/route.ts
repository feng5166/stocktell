import { NextRequest, NextResponse } from "next/server";
import { isAdminAuthorized } from "@/lib/api-guard";
import { isAdminSession } from "@/lib/admin";
import { runPreOpenDigest } from "@/lib/digest";

export const dynamic = "force-dynamic";
export const maxDuration = 300; // 全量逐用户发送 + 每人早报可能较慢,给足时间

// 后台:手动把「今日简报」推给订阅用户(digestOptOut=false 且有相关动态)。
// 默认只补当天没发过的(digest_send_log 幂等,2026-07-03 复盘产物);?force=1 忽略记录全量重发。
// 返回逐用户结果 + 失败清单。用于当天 cron 漏发/被截断后的人工补推。
export async function POST(req: NextRequest) {
  if (!isAdminAuthorized(req) && !(await isAdminSession())) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }
  const force = req.nextUrl.searchParams.get("force") === "1";
  const res = await runPreOpenDigest({ force });
  const failedList = (res.results ?? [])
    .filter((r) => !r.sent)
    .map((r) => ({ email: r.email, mode: r.mode }));
  return NextResponse.json({
    ok: res.ok,
    date: res.date,
    force,
    candidates: res.candidates,
    sent: res.sent,
    alreadySent: res.alreadySent ?? 0, // 当天已发过而跳过的人数
    failed: res.failed ?? 0,
    failedList, // 发送失败的用户(邮箱 + 模式),供记录/排查
  });
}
