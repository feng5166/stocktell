import { NextRequest, NextResponse } from "next/server";
import { bindWeixinByToken } from "@/lib/weixin-bind";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const secret = process.env.CLAWBOT_SECRET;
  if (secret && req.headers.get("x-clawbot-secret") !== secret) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  const { token, openId } = await req.json();
  if (!token || !openId) {
    return NextResponse.json({ ok: false, error: "missing_params" }, { status: 400 });
  }

  const result = await bindWeixinByToken(token, openId);

  let replyText = "";
  if (result.ok) {
    replyText = "✓ 绑定成功!\n\n每天早上 8 点,只在你的自选股有动静时提醒你。\n没动静那天不打扰。\n\n发「解绑」可取消推送。";
  } else if (result.error === "token_expired") {
    replyText = "绑定码已过期(有效期 10 分钟),请回 stocktell.me 重新获取。";
  } else if (result.error === "token_used") {
    replyText = "这个绑定码已经用过了,请回 stocktell.me 重新获取。";
  } else if (result.error === "openid_taken") {
    replyText = "这个微信已绑定了另一个账号,如需换绑请先解绑原账号。";
  } else {
    replyText = "绑定失败,请重试或联系支持。";
  }

  return NextResponse.json({ ok: result.ok, error: result.error, replyText });
}
