// 轻量内存滑动窗口限流。
// ⚠️ Serverless 多实例下为「尽力而为」:每个函数实例各自计数,不是全局强一致。
// 目的是显著抬高暴力破解 / 邮箱枚举 / 找回邮件轰炸的成本,而非做强保证。
// 若日后要强一致,换 Upstash Ratelimit / Redis 即可(接口保持 rateLimit(key,...))。

type Hit = { count: number; reset: number };
const store = new Map<string, Hit>();
let lastSweep = 0;

// 顺手清理过期 key,避免 map 无限增长(最多每分钟扫一次)
function sweep(now: number) {
  if (now - lastSweep < 60_000) return;
  lastSweep = now;
  for (const [k, v] of Array.from(store.entries()))
    if (v.reset <= now) store.delete(k);
}

export interface RateResult {
  ok: boolean;
  remaining: number;
  retryAfterSec: number;
}

/** 固定窗口计数:同一 key 在 windowMs 内最多 limit 次。 */
export function rateLimit(key: string, limit: number, windowMs: number): RateResult {
  const now = Date.now();
  sweep(now);
  const cur = store.get(key);
  if (!cur || cur.reset <= now) {
    store.set(key, { count: 1, reset: now + windowMs });
    return { ok: true, remaining: limit - 1, retryAfterSec: 0 };
  }
  if (cur.count >= limit) {
    return { ok: false, remaining: 0, retryAfterSec: Math.ceil((cur.reset - now) / 1000) };
  }
  cur.count++;
  return { ok: true, remaining: limit - cur.count, retryAfterSec: 0 };
}

/** 从请求头取客户端 IP(Vercel 走 x-forwarded-for);兼容 NextRequest 与 next-auth 的 req。 */
export function clientIp(headers: Headers | Record<string, string | string[] | undefined> | undefined): string {
  if (!headers) return "unknown";
  let xff: string | undefined;
  if (typeof (headers as Headers).get === "function") {
    xff = (headers as Headers).get("x-forwarded-for") ?? undefined;
  } else {
    const v = (headers as Record<string, string | string[] | undefined>)["x-forwarded-for"];
    xff = Array.isArray(v) ? v[0] : v;
  }
  return xff?.split(",")[0]?.trim() || "unknown";
}
