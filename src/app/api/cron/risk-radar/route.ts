import { NextRequest, NextResponse } from "next/server";
import { runRiskRadar } from "@/lib/risk-radar";
import { isCronAuthorized } from "@/lib/api-guard";
import { alertCron } from "@/lib/monitor";
import { tradingDayGate } from "@/lib/trading-gate";
import { todayISO } from "@/lib/date";

export const dynamic = "force-dynamic";
// 全体用户自选并集,每票 5 路 Tushare 强制回源(allowStale:false)+ 逐用户发信。
// 60s 会被 Vercel 硬杀,硬杀绕过下面的 catch→alertCron = 当天雷区推送静默丢失。
export const maxDuration = 300;

// 雷区雷达推送:每日盘前(vercel.json cron 22:50 UTC = 北京 06:50 触发)。独立一条「雷区提醒」,不并入早报。
export async function GET(req: NextRequest) {
  if (!isCronAuthorized(req)) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }
  // 交易日闸门:只在确定休市(周末/确认节假日)跳过;unknown(Tushare 抖动)照常交付——
  // 本路由加闸门前本就无条件交付、不依赖 trade_cal,不能因闸门凭空多出"Tushare 挂就漏发"(评审)。
  const date = todayISO();
  const gate = await tradingDayGate(date, "risk-radar(雷区提醒)", {
    onUnknown: "proceed",
  });
  if (gate) return NextResponse.json({ ok: true, ...gate });
  try {
    const result = await runRiskRadar();
    if (result.candidates > 0 && result.pushed === 0) {
      await alertCron(
        "risk-radar(雷区提醒)",
        `${date} 雷区推送 candidates=${result.candidates} 但 pushed=0(桥慢/挂 或 Resend 失败,需核查——非必然双双失败)`
      );
    }
    return NextResponse.json(result);
  } catch (e) {
    await alertCron("risk-radar(雷区提醒)", e);
    return NextResponse.json({ ok: false, error: String(e) }, { status: 500 });
  }
}
