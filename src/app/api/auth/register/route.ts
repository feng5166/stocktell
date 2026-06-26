import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { getPrisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const db = getPrisma();
  if (!db) {
    return NextResponse.json({ error: "数据库未连接" }, { status: 500 });
  }
  const { email, password } = await req.json();

  if (!email || !password) {
    return NextResponse.json({ error: "邮箱和密码不能为空" }, { status: 400 });
  }
  if (String(password).length < 8) {
    return NextResponse.json({ error: "密码至少8位" }, { status: 400 });
  }
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  const normalizedEmail = String(email).toLowerCase().trim();
  if (!emailRegex.test(normalizedEmail)) {
    return NextResponse.json({ error: "邮箱格式不正确" }, { status: 400 });
  }

  const existing = await db.user.findUnique({ where: { email: normalizedEmail } });
  if (existing) {
    return NextResponse.json({ error: "该邮箱已注册" }, { status: 409 });
  }

  const passwordHash = await bcrypt.hash(password, 10);
  const user = await db.user.create({
    data: {
      email: normalizedEmail,
      passwordHash,
      nickname: normalizedEmail.split("@")[0],
    },
  });
  return NextResponse.json({ id: user.id, email: user.email }, { status: 201 });
}
