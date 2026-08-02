import { NextRequest, NextResponse } from "next/server";
import { resolveShareLink } from "@/lib/share-link";

export const dynamic = "force-dynamic";

// 短链 302(2.3 P0-3):/s/[code] → 站内承接页,写 30 天归因 cookie。
// target 在库中被约束为站内路径(创建/解析双侧校验)——绝不做开放跳转。
// 未知/失效码 → 302 首页(不 404:扫到旧卡也给个落点)。
export async function GET(req: NextRequest, { params }: { params: { code: string } }) {
  const code = params.code.slice(0, 16);
  const hit = /^[a-z0-9]+$/.test(code) ? await resolveShareLink(code).catch(() => null) : null;
  const target = hit
    ? `${hit.target}${hit.target.includes("?") ? "&" : "?"}sc=${encodeURIComponent(code)}&card=${encodeURIComponent(hit.cardType)}`
    : "/";
  const res = NextResponse.redirect(new URL(target, req.nextUrl.origin), 302);
  if (hit) {
    // 归因 cookie:30 天(viral-growth-plan §5);只存短码,不含个人信息
    res.cookies.set("st_ref", code, {
      maxAge: 30 * 86400,
      path: "/",
      sameSite: "lax",
    });
  }
  return res;
}
