import type { NextRequest } from "next/server";

// cron 鉴权:配了 CRON_SECRET 就校验 Authorization: Bearer;未配则放行(与现状一致)
export function isCronAuthorized(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return true;
  return req.headers.get("authorization") === `Bearer ${secret}`;
}

// admin 鉴权:?token= 必须等于 ADMIN_TOKEN(未配 ADMIN_TOKEN 一律拒)
export function isAdminAuthorized(req: NextRequest): boolean {
  const token = req.nextUrl.searchParams.get("token");
  return !!process.env.ADMIN_TOKEN && token === process.env.ADMIN_TOKEN;
}
