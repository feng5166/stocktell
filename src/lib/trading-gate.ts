import { ashareDayStatus } from "@/lib/tushare";
import { getPrisma } from "@/lib/prisma";
import { alertCron } from "@/lib/monitor";

// 盘前/收盘 cron 的统一交易日闸门。收敛四处复制粘贴(briefing/outcome/push-weixin/risk-radar),
// 并解决「Tushare 挂一天、4 个 cron + 补位各发一条几乎相同告警」的告警风暴。
//
// 返回 null = 是交易日,调用方继续;返回对象 = 非交易日/无法确认,调用方直接 JSON 返回之。
// status:
//   - "closed":周末或 Tushare 确认休市 → 静默跳过(正常,不告警)。
//   - "unknown":工作日但 Tushare 不可用 → 跳过 + 告警(否则真交易日被静默漏掉)。
//     dedupeUnknown=true 的调用方共享「当天一条」告警(原子占位:谁先谁发),避免风暴;
//     outcome(15:30,与盘前不同时段/不同关切)用 false,自己独立告警。
export async function tradingDayGate(
  date: string,
  task: string,
  opts: { recoveryHint: string; dedupeUnknown?: boolean }
): Promise<{ skipped: "non-trading-day" | "trading-day-unknown"; date: string } | null> {
  const status = await ashareDayStatus(date);
  if (status === "trading") return null;
  if (status === "unknown") {
    const shouldAlert = opts.dedupeUnknown
      ? await claimDailyAlert(date)
      : true;
    if (shouldAlert) {
      await alertCron(
        task,
        `${date} Tushare 交易日历不可用,无法确认是否交易日 → 已跳过当天盘前任务。若为交易日:${opts.recoveryHint}`
      );
    }
    return { skipped: "trading-day-unknown", date };
  }
  return { skipped: "non-trading-day", date };
}

// 原子占位:当天第一个探到 unknown 的 cron 发告警,其余撞唯一键冲突→不重复发。
// 无库时不去重(宁可多发也别漏)。
async function claimDailyAlert(date: string): Promise<boolean> {
  const db = getPrisma();
  if (!db) return true;
  try {
    await db.quotesCache.create({
      data: { id: `tushare-unknown-alerted:${date}`, data: { at: 1 } },
    });
    return true; // create 成功 = 我是第一个
  } catch {
    return false; // 主键冲突 = 已有别的 cron 发过
  }
}
