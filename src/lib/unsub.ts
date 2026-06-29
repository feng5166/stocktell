// 邮件退订:用 HMAC 给每个 userId 生成稳定签名,放进邮件链接里。
// 这样用户不登录、点邮件里的"取消推送"即可退订,且别人无法伪造他人的退订链接。
import { createHmac, timingSafeEqual } from "crypto";

const SECRET =
  process.env.UNSUB_SECRET ||
  process.env.NEXTAUTH_SECRET ||
  process.env.CRON_SECRET ||
  "stocktell-unsub-fallback";

export function unsubToken(userId: string): string {
  return createHmac("sha256", SECRET)
    .update(`digest-unsub:${userId}`)
    .digest("base64url")
    .slice(0, 24);
}

export function verifyUnsub(userId: string, token: string): boolean {
  if (!userId || !token) return false;
  const expect = unsubToken(userId);
  if (token.length !== expect.length) return false;
  try {
    return timingSafeEqual(Buffer.from(token), Buffer.from(expect));
  } catch {
    return false;
  }
}

// 退订/重订链接(base 不带尾斜杠)
export function unsubUrl(base: string, userId: string): string {
  const b = base.replace(/\/+$/, "");
  return `${b}/api/digest/unsubscribe?u=${encodeURIComponent(userId)}&t=${unsubToken(userId)}`;
}
