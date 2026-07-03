import { NextRequest, NextResponse } from "next/server";
import { runWeixinPush } from "@/lib/push-weixin";
import { isCronAuthorized } from "@/lib/api-guard";
import { alertCron } from "@/lib/monitor";
import { tradingDayGate } from "@/lib/trading-gate";
import { todayISO } from "@/lib/date";

export const dynamic = "force-dynamic";
// 逐用户串行:每人早报冷缓存最坏 ~22s LLM + buildWatchAlerts 里 Tushare 冷路径多次 7.5s。
// 60s 会被 Vercel 硬杀,硬杀绕过下面的 catch→alertCron = 静默丢失(与 07-03 briefing 同款)。
export const maxDuration = 300;

export async function GET(req: NextRequest) {
  if (!isCronAuthorized(req)) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }
  // 交易日闸门(fail-closed;unknown 跳过并告警,当天全局去重)。
  const date = todayISO();
  const gate = await tradingDayGate(date, "push-weixin(微信推送)", {
    dedupeUnknown: true,
    recoveryHint: "手动触发 GET /api/cron/push-weixin",
  });
  if (gate) return NextResponse.json({ ok: true, ...gate });
  try {
    const result = await runWeixinPush();
    // 注:不为 candidates>0&&sent=0 单独告警——微信是已隐藏入口的降级渠道、iLink 桥长期半死,
    // 每交易日都告警会造成噪声疲劳(评审 finding 10)。桥修复/重启用微信另作决策再说。
    return NextResponse.json(result);
  } catch (e) {
    await alertCron("push-weixin(微信推送)", e);
    return NextResponse.json({ ok: false, error: String(e) }, { status: 500 });
  }
}
