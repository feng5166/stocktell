import { NextRequest, NextResponse } from "next/server";
import { runIntradayAlert } from "@/lib/intraday-alert";
import { isCronAuthorized } from "@/lib/api-guard";
import { alertCron } from "@/lib/monitor";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// ⚠️ 已下线(2026-07-03):此功能事实上从未有效运行——
//   ① 排期靠 GitHub Actions,GH 调度器盘中高峰严重饿死(实测每天仅约 2 次、且时间漂移到交易窗口外);
//   ② 唯一推送通道是已隐藏入口的微信 iLink 桥(SHOW_WEIXIN_PUSH=false),存量绑定用户也收不到。
// 已删除 .github/workflows/intraday-alert.yml 停掉无效触发;代码保留待日后接 Web Push/邮件通道时复活。
// 复活前置:接非微信通道 + 迁 Vercel 分钟级 cron + 给 runIntradayAlert 加发送失败告警/幂等(见评审)。
const DISABLED = true;

export async function GET(req: NextRequest) {
  if (!isCronAuthorized(req)) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }
  if (DISABLED) {
    return NextResponse.json({ ok: true, skipped: "disabled", reason: "无有效推送通道+GH排期已删,待重构" });
  }
  try {
    const r = await runIntradayAlert();
    return NextResponse.json(r);
  } catch (e) {
    await alertCron("intraday-alert(盘中异动)", e);
    return NextResponse.json({ ok: false, error: String(e) }, { status: 500 });
  }
}
