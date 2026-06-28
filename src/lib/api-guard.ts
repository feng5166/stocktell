import { timingSafeEqual } from "crypto";
import type { NextRequest } from "next/server";

// 常量时间比较,避免时间侧信道;长度不同直接 false(timingSafeEqual 要求等长)
function safeEqual(a: string, b: string): boolean {
  const ba = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ba.length !== bb.length) return false;
  return timingSafeEqual(ba, bb);
}

// 从 Authorization: Bearer <token> 取 token(不再用 query string,避免 token 进日志/Referer)
function bearer(req: NextRequest): string | null {
  const m = (req.headers.get("authorization") || "").match(/^Bearer\s+(.+)$/i);
  return m?.[1] ?? null;
}

// cron 鉴权:配了 CRON_SECRET 就校验 Authorization: Bearer;未配则放行(与现状一致)
export function isCronAuthorized(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return true;
  const token = bearer(req);
  return !!token && safeEqual(token, secret);
}

// admin 鉴权:Authorization: Bearer 必须等于 ADMIN_TOKEN(未配 ADMIN_TOKEN 一律拒)。
// 改用请求头而非 ?token=:token 走 URL 会进访问日志/CDN/Referer/浏览器历史,易泄漏。
export function isAdminAuthorized(req: NextRequest): boolean {
  const expected = process.env.ADMIN_TOKEN;
  if (!expected) return false;
  const token = bearer(req);
  return !!token && safeEqual(token, expected);
}
