import { ashareDayStatus } from "@/lib/tushare";
import { alertCron } from "@/lib/monitor";

// 盘前/收盘 cron 的统一交易日闸门,收敛四处复制粘贴。
//
// 返回 null = 继续;返回对象 = 跳过,调用方直接 JSON 返回之。
// 关键:unknown(工作日但 Tushare trade_cal 不可用)的处置按调用方性质分两类——
//   - onUnknown:"skip"(briefing/outcome):会对用户做不可逆动作(生成并推送简报/记账)。
//     假日误发错内容/污染战绩不可撤回 → 跳过 + 告警(告警是为了不静默漏掉真交易日)。
//   - onUnknown:"proceed"(risk-radar/push-weixin):纯交付,且加闸门前本就无条件交付、
//     不依赖 trade_cal。若 unknown 也跳过 = 凭空给交付路径塞了个"Tushare 抖动就漏发"的
//     新失败模式(评审确认的回归)。所以 unknown 照常交付(与旧行为一致);闸门对它们的
//     价值仅在于确定休市(周末/确认节假日)时不空跑、不推重复内容。
// closed(周末/Tushare 确认休市)一律静默跳过,不告警。
export async function tradingDayGate(
  date: string,
  task: string,
  opts: { onUnknown: "skip" | "proceed"; recoveryHint?: string }
): Promise<{ skipped: "non-trading-day" | "trading-day-unknown"; date: string } | null> {
  const status = await ashareDayStatus(date);
  if (status === "trading") return null;
  if (status === "closed") return { skipped: "non-trading-day", date };
  // status === "unknown"
  if (opts.onUnknown === "proceed") return null; // 交付型:照常交付,不新增跳过
  await alertCron(
    task,
    `${date} Tushare 交易日历不可用,无法确认是否交易日 → 已跳过「${task}」。若为交易日:${
      opts.recoveryHint ?? "请手动补"
    }`
  );
  return { skipped: "trading-day-unknown", date };
}
