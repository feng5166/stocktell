import crypto from "crypto";
import bcrypt from "bcryptjs";
import { getPrisma } from "@/lib/prisma";
import { sendMail } from "@/lib/mailer";

const TOKEN_EXPIRY_MINUTES = 15;

function hashToken(token: string): string {
  return crypto.createHash("sha256").update(token).digest("hex");
}

export async function createAndSaveResetToken(email: string): Promise<string | null> {
  const db = getPrisma();
  if (!db) return null;
  const token = crypto.randomBytes(32).toString("hex");
  const expiresAt = new Date(Date.now() + TOKEN_EXPIRY_MINUTES * 60 * 1000);
  await db.passwordResetToken.create({
    data: { email, token: hashToken(token), expiresAt },
  });
  return token;
}

export async function validateResetToken(
  token: string
): Promise<{ email: string } | null> {
  const db = getPrisma();
  if (!db) return null;
  const rec = await db.passwordResetToken.findUnique({
    where: { token: hashToken(token) },
  });
  if (!rec || rec.used || rec.expiresAt < new Date()) return null;
  return { email: rec.email };
}

export async function resetPassword(
  token: string,
  newPassword: string
): Promise<boolean> {
  const db = getPrisma();
  if (!db) return false;
  const tokenHash = hashToken(token);
  const passwordHash = await bcrypt.hash(newPassword, 10);
  try {
    await db.$transaction(async (tx) => {
      const rec = await tx.passwordResetToken.findUnique({ where: { token: tokenHash } });
      if (!rec || rec.used || rec.expiresAt < new Date()) throw new Error("INVALID");
      await tx.passwordResetToken.update({ where: { token: tokenHash }, data: { used: true } });
      await tx.user.update({ where: { email: rec.email }, data: { passwordHash } });
    });
    return true;
  } catch {
    return false;
  }
}

// 发重置邮件,统一走 sendMail;发信失败(返回 false)时抛错(保持原有失败语义)。
export async function sendResetEmail(email: string, resetUrl: string): Promise<void> {
  const ok = await sendMail({
    to: email,
    subject: "重置您的 StockTell 密码",
    text: `点击以下链接重置密码(15 分钟内有效):\n${resetUrl}\n\n如果不是您本人操作,请忽略此邮件。`,
    html: `<div style="font-family:sans-serif;max-width:480px;margin:0 auto">
      <h2>重置 StockTell 密码</h2>
      <p>点击下面的按钮重置密码,链接 15 分钟内有效:</p>
      <p><a href="${resetUrl}" style="display:inline-block;background:#111;color:#fff;padding:10px 20px;border-radius:8px;text-decoration:none">重置密码</a></p>
      <p style="color:#888;font-size:12px">如果不是您本人操作,请忽略此邮件。</p>
    </div>`,
  });
  if (!ok) {
    throw new Error("邮件发送失败");
  }
}
