import { sendFeishu } from "@/lib/feishu";

// cron / 关键任务失败告警:复用飞书 bot,把"静默失败"变成可感知。
// 自身不抛错(告警失败不该让主流程更糟)。
export async function alertCron(name: string, err: unknown): Promise<void> {
  const msg = err instanceof Error ? err.message : String(err);
  await sendFeishu(`🚨 StockTell cron 失败 | ${name}\n${msg.slice(0, 800)}`).catch(
    () => {}
  );
}
