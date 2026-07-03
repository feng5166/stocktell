// 调用自托管 iLink 桥(多租户)的小工具
const BASE = process.env.CLAWBOT_BASE_URL; // 如 http://47.84.8.167:8787
const SECRET = process.env.CLAWBOT_SECRET;

const CLAWBOT_TIMEOUT_MS = 6000;

export async function clawbot<T = unknown>(
  path: string,
  body?: unknown,
  method = "POST"
): Promise<T | null> {
  if (!BASE) return null;
  // ⚠️ 自建 iLink 桥是明文 HTTP 的脆弱 VPS,半死(TCP 可连、不回包)时裸 fetch 会挂到
  // undici 默认 ~300s,把调用它的 cron(push-weixin/risk-radar)整个吊死到 maxDuration 被硬杀,
  // 硬杀绕过调用方 catch→alertCron = 静默丢失。必须自带超时。
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), CLAWBOT_TIMEOUT_MS);
  try {
    const r = await fetch(`${BASE}${path}`, {
      method,
      headers: {
        "Content-Type": "application/json",
        ...(SECRET ? { "x-clawbot-secret": SECRET } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
      cache: "no-store",
      signal: ctrl.signal,
    });
    return (await r.json().catch(() => null)) as T;
  } catch (e) {
    console.error("[clawbot] error:", e);
    return null;
  } finally {
    clearTimeout(t);
  }
}
