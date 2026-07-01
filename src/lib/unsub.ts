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

// 邮件退订页脚(唯一来源)——所有发信模板(早报/雷区/后台群发)都用它,改样式只改这里。
// 刻意低调(小灰字,非按钮),但退订仍可达(合规 + 找不到会点"垃圾邮件"反伤域名信誉);
// 给两条路(一键退订 + 设置管理)并附 List-Unsubscribe 头(客户端原生一键退订)。
export function unsubFooter(
  base: string,
  userId: string
): { html: string; text: string; headers: Record<string, string> } {
  const b = base.replace(/\/+$/, "");
  const url = unsubUrl(b, userId);
  return {
    html: `<p style="margin:20px 0 0;text-align:center;color:#bbb;font-size:11px;line-height:1.6">不想收到?<a href="${url}" style="color:#aaa;text-decoration:underline">退订</a>,或在<a href="${b}/settings" style="color:#aaa;text-decoration:underline">设置</a>里管理推送</p>`,
    text: `\n\n不想收到?退订:${url} · 或在设置里管理:${b}/settings`,
    headers: {
      "List-Unsubscribe": `<${url}>`,
      "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
    },
  };
}
