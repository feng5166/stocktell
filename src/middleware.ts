import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getToken } from "next-auth/jwt";

// /admin/* 统一鉴权:在渲染前拦截。非管理员一律 404(不暴露后台存在)。
// 用 JWT 里的 email 判定(authorize/Google 登录都会带 email),边缘可读,无需查库。
const ADMIN_EMAILS = (
  process.env.ADMIN_EMAILS ?? "feng5166@gmail.com,feng.5166@163.com"
)
  .split(",")
  .map((e) => e.trim().toLowerCase())
  .filter(Boolean);

export async function middleware(req: NextRequest) {
  const token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET });
  const email = (token?.email as string | undefined)?.toLowerCase();
  if (!email || !ADMIN_EMAILS.includes(email)) {
    return new NextResponse("Not Found", { status: 404 });
  }
  return NextResponse.next();
}

export const config = { matcher: ["/admin", "/admin/:path*"] };
