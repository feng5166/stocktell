import { sendFeishu } from "@/lib/feishu";

// cron / 关键任务失败告警:复用飞书 bot,把"静默失败"变成可感知。
// 自身不抛错(告警失败不该让主流程更糟)。
export async function alertCron(name: string, err: unknown): Promise<void> {
  const msg = err instanceof Error ? err.message : String(err);
  await sendFeishu(`🚨 StockTell cron 失败 | ${name}\n${msg.slice(0, 800)}`).catch(
    () => {}
  );
}

// 通用节流告警:同 key 在冷却期内只发一条,防同类失败(如多只票同时拿不到基本面)刷屏飞书。
// 注:serverless 内存冷却是"每实例"的,不跨实例;够用来消抖,不追求全局唯一。自身不抛错。
const lastAlertAt = new Map<string, number>();
export async function alertThrottled(
  key: string,
  text: string,
  cooldownMs = 10 * 60 * 1000
): Promise<void> {
  const now = Date.now();
  if (now - (lastAlertAt.get(key) ?? 0) < cooldownMs) return;
  lastAlertAt.set(key, now);
  await sendFeishu(text.slice(0, 800)).catch(() => {});
}
