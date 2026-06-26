import { NextRequest, NextResponse } from "next/server";
import { createAndSaveResetToken, sendResetEmail } from "@/lib/password-reset";
import { getPrisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function POST(req: NextRequest) {
  const { email } = await req.json();
  if (!email || !EMAIL_REGEX.test(email)) {
    return NextResponse.json({ success: false, error: "INVALID_EMAIL" }, { status: 400 });
  }
  const normalized = String(email).toLowerCase().trim();

  // 不暴露邮箱是否注册:无论是否存在都返回成功
  try {
    const db = getPrisma();
    const user = db ? await db.user.findUnique({ where: { email: normalized } }) : null;
    if (user) {
      const token = await createAndSaveResetToken(normalized);
      if (token) {
        const base = process.env.NEXTAUTH_URL || "http://localhost:3000";
        await sendResetEmail(normalized, `${base}/reset-password?token=${encodeURIComponent(token)}`);
      }
    }
  } catch (e) {
    console.error("[forgot-password]", e);
  }
  return NextResponse.json({ success: true });
}
