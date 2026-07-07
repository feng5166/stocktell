// DB 瞬态故障重试(2.1 第1周稳定性,2026-07-07 canary 实证:07:00 cron 密集窗口
// listBriefing 首查撞 P2024 连接池超时,主跑整段失败、靠 07:40 补位自愈)。
//
// 【只给幂等读用】:写路径(insertDrafts 等)不得套本函数——超时可能发生在"已提交、响应未回"
// 之后,重试会重复写入;写失败交给 07:40 backup 的幂等补位,那是设计好的恢复层。
//
// 只重试连接层瞬态错误(池超时/连不上/连接被掐),业务错误(约束冲突、语法、数据问题)原样抛:
// 重试它们只会把真 bug 拖慢 3 倍才暴露。
const TRANSIENT_CODES = new Set([
  "P2024", // Timed out fetching a new connection from the connection pool
  "P1001", // Can't reach database server
  "P1002", // Database server reached but timed out
  "P1008", // Operations timed out
  "P1017", // Server has closed the connection
]);

function isTransient(e: unknown): boolean {
  const code = (e as { code?: string })?.code;
  if (code && TRANSIENT_CODES.has(code)) return true;
  // pgbouncer/网络层偶发不带 Prisma code,按错误文案兜一层
  const msg = e instanceof Error ? e.message : String(e);
  return /connection pool|ECONNRESET|ETIMEDOUT|Connection terminated/i.test(msg);
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// 幂等读重试:默认 2 次,2s/4s 退避(总额外 ~6s,07:00 cron maxDuration=300s 吃得下)。
// 重试耗尽后抛最后一次错误,并在 message 前缀标注已重试——告警文案能区分"抖一下就好"
// 和"重试后仍失败"。
export async function dbReadRetry<T>(
  fn: () => Promise<T>,
  label: string,
  retries = 2
): Promise<T> {
  let lastErr: unknown;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await fn();
    } catch (e) {
      lastErr = e;
      if (!isTransient(e) || attempt === retries) break;
      const backoff = 2000 * Math.pow(2, attempt);
      console.warn(`[db-retry] ${label} 瞬态失败(第 ${attempt + 1} 次),${backoff}ms 后重试:`, e);
      await sleep(backoff);
    }
  }
  if (isTransient(lastErr) && lastErr instanceof Error) {
    lastErr.message = `[已重试 ${retries} 次仍失败] ${lastErr.message}`;
  }
  throw lastErr;
}
