// 进程内单飞(single-flight):同一 key 的并发调用合并为一次执行,其余复用同一 Promise。
// 用途:缓存冷/刚过期的瞬间,N 个并发请求只回源一次,避免击穿放大对 Tushare 的调用。
// 仅同一 Serverless 实例内有效;跨实例的持久去重靠 DB 缓存层(fundDayCache 等)。
const inflight = new Map<string, Promise<unknown>>();

export function singleFlight<T>(key: string, fn: () => Promise<T>): Promise<T> {
  const hit = inflight.get(key);
  if (hit) return hit as Promise<T>;
  // 包一层 async 保证即便 fn 同步抛错也走 Promise 路径;完成后无论成败都清理 key。
  const p = (async () => fn())().finally(() => inflight.delete(key));
  inflight.set(key, p);
  return p;
}
