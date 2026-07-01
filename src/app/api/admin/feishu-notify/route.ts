import { NextRequest, NextResponse } from "next/server";
import { isAdminAuthorized } from "@/lib/api-guard";
import { isAdminSession } from "@/lib/admin";
import { sendFeishu } from "@/lib/feishu";

export const dynamic = "force-dynamic";

// 管理员手动给飞书发一条任意文本(工作总结/备忘/提醒等)。返回飞书真实投递结果。
export async function POST(req: NextRequest) {
  if (!isAdminAuthorized(req) && !(await isAdminSession())) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }
  const body = await req.json().catch(() => ({}));
  const text = typeof body.text === "string" ? body.text.trim() : "";
  if (!text) return NextResponse.json({ ok: false, error: "缺少 text" }, { status: 400 });
  const res = await sendFeishu(text);
  return NextResponse.json({ ok: res.ok, feishu: res });
}
