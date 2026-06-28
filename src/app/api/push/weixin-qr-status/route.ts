import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { bindWeixinDirect, markWeixinScanned } from "@/lib/weixin-bind";
import { clawbot } from "@/lib/clawbot";

export const dynamic = "force-dynamic";

// 前端轮询绑定状态:pending(待扫码)→ scanned(待发消息激活)→ activated(完成)
export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }
  const qrcode = req.nextUrl.searchParams.get("qrcode");
  if (!qrcode) {
    return NextResponse.json({ ok: false, error: "missing_qrcode" }, { status: 400 });
  }
  const r = await clawbot<{ ok: boolean; state: string; openId: string | null }>("/bind/poll", { qrcode });
  const state = r?.state || "expired";
  // 激活时兜底落库(桥也会调 bind-weixin-direct,这里以会话账号为准再确保一次)
  if (state === "activated" && r?.openId) {
    await bindWeixinDirect(session.user.id, r.openId);
  } else if (state === "scanned") {
    // 扫了码但还没发消息激活:记下时间戳,供站内"还差一步"提醒 + 后台统计(激活/解绑时清空)
    await markWeixinScanned(session.user.id).catch(() => {});
  }
  return NextResponse.json({ ok: true, state, openId: r?.openId || null });
}
