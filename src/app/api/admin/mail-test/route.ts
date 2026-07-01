import { NextRequest, NextResponse } from "next/server";
import { isAdminAuthorized } from "@/lib/api-guard";
import { isAdminSession } from "@/lib/admin";
import { sendMailResult } from "@/lib/mailer";

export const dynamic = "force-dynamic";

// 后台:向指定地址发一封投递自检邮件,返回 Resend 的真实结果(ok/error/id),
// 用于排查某地址为何发不出去(抑制名单 / 无效地址 / 限流…)。body: { to: string }
export async function POST(req: NextRequest) {
  if (!isAdminAuthorized(req) && !(await isAdminSession())) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }
  const { to } = await req.json().catch(() => ({}));
  if (!to || typeof to !== "string") {
    return NextResponse.json({ ok: false, error: "missing to" }, { status: 400 });
  }
  const res = await sendMailResult({
    to,
    subject: "StockTell 投递自检",
    text: "这是一封 StockTell 投递自检邮件,收到即说明该地址可正常接收。",
    html: `<div style="font-family:sans-serif;font-size:14px;color:#1a1d24">这是一封 StockTell 投递自检邮件,收到即说明该地址可正常接收。</div>`,
  });
  return NextResponse.json({ to, ...res });
}
