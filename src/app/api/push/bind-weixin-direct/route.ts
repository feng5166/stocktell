import { NextRequest, NextResponse } from "next/server";
import { bindWeixinDirect } from "@/lib/weixin-bind";
import { isClawbotAuthorized } from "@/lib/api-guard";

export const dynamic = "force-dynamic";

// 桥端:扫码激活后按账号直接落库(x-clawbot-secret 鉴权,fail-closed)
export async function POST(req: NextRequest) {
  if (!isClawbotAuthorized(req)) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }
  const { accountId, openId } = await req.json();
  if (!accountId || !openId) {
    return NextResponse.json({ ok: false, error: "missing_params" }, { status: 400 });
  }
  const r = await bindWeixinDirect(String(accountId), String(openId));
  return NextResponse.json(r);
}
