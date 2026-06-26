import { NextRequest, NextResponse } from "next/server";
import { validateResetToken, resetPassword } from "@/lib/password-reset";

export const dynamic = "force-dynamic";

// GET:只读校验 token
export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get("token");
  if (!token) {
    return NextResponse.json({ valid: false, error: "MISSING_TOKEN" }, { status: 400 });
  }
  const result = await validateResetToken(token);
  if (!result) {
    return NextResponse.json(
      { valid: false, error: "INVALID_TOKEN", message: "重置链接无效或已过期,请重新申请" },
      { status: 410 }
    );
  }
  return NextResponse.json({ valid: true, email: result.email });
}

// POST:执行重置
export async function POST(req: NextRequest) {
  const { token, password, confirmPassword } = await req.json();
  if (!token || !password || !confirmPassword) {
    return NextResponse.json({ success: false, message: "缺少必要参数" }, { status: 400 });
  }
  if (password !== confirmPassword) {
    return NextResponse.json({ success: false, message: "两次输入的密码不一致" }, { status: 400 });
  }
  if (String(password).length < 8) {
    return NextResponse.json({ success: false, message: "密码至少8个字符" }, { status: 400 });
  }
  const ok = await resetPassword(token, password);
  if (!ok) {
    return NextResponse.json(
      { success: false, message: "重置链接无效或已过期,请重新申请" },
      { status: 400 }
    );
  }
  return NextResponse.json({ success: true });
}
