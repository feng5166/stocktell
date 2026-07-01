import { NextRequest, NextResponse } from "next/server";
import { isAdminAuthorized } from "@/lib/api-guard";
import { isAdminSession } from "@/lib/admin";
import { sendFeishu } from "@/lib/feishu";

export const dynamic = "force-dynamic";
export const maxDuration = 20;

// 管理员给自己(FEISHU_USER_OPEN_ID)发一条自定义飞书文本。用于把产品/决策总结推到飞书备查。
// 飞书凭据在 Vercel 是 Sensitive(加密)、本地 env pull 拿到的是密文,故只能从生产侧发。
// 用法:POST {text} (Authorization: Bearer ADMIN_TOKEN),或管理员登录态。
export async function POST(req: NextRequest) {
  if (!isAdminAuthorized(req) && !(await isAdminSession())) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }
  const body = await req.json().catch(() => ({}));
  const text = typeof body.text === "string" ? body.text.trim() : "";
  if (!text) {
    return NextResponse.json({ ok: false, error: "text 必填" }, { status: 400 });
  }
  const r = await sendFeishu(text);
  return NextResponse.json(r, { status: r.ok ? 200 : 502 });
}
