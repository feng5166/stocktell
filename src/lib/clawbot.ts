// 调用自托管 iLink 桥(多租户)的小工具
const BASE = process.env.CLAWBOT_BASE_URL; // 如 http://47.84.8.167:8787
const SECRET = process.env.CLAWBOT_SECRET;

export async function clawbot<T = unknown>(
  path: string,
  body?: unknown,
  method = "POST"
): Promise<T | null> {
  if (!BASE) return null;
  try {
    const r = await fetch(`${BASE}${path}`, {
      method,
      headers: {
        "Content-Type": "application/json",
        ...(SECRET ? { "x-clawbot-secret": SECRET } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
      cache: "no-store",
    });
    return (await r.json().catch(() => null)) as T;
  } catch (e) {
    console.error("[clawbot] error:", e);
    return null;
  }
}
