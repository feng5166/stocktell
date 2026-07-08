import webpush from "web-push";

const PUB = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
const PRIV = process.env.VAPID_PRIVATE_KEY;
const SUBJECT = process.env.VAPID_SUBJECT || "mailto:noreply@maoadao.com";

let configured = false;
export function pushEnabled(): boolean {
  return !!(PUB && PRIV);
}
function ensure() {
  if (!configured && pushEnabled()) {
    webpush.setVapidDetails(SUBJECT, PUB!, PRIV!);
    configured = true;
  }
}

export interface SubLike {
  endpoint: string;
  p256dh: string;
  auth: string;
}

export interface PushPayload {
  title: string;
  body: string;
  url?: string;
}

// web-push 内置 socket timeout(超时即 destroy 请求并 reject),用它防止黑洞 endpoint 把
// 串行循环拖满调用方 maxDuration。不再自己 Promise.race——那会:①留下未 clear 的定时器泄漏
// ②在 web-push 已接受(8s)与 race 兜底(9s)之间把"其实成功"误报成 error。
// 不设 TTL(用默认 4 周):强设短 TTL 会让离线设备重连后收不到当天提醒(评审 finding 12)。
const PUSH_TIMEOUT_MS = 8000;

// 返回 "ok" | "gone"(订阅失效需删除)| "error"
export async function sendPush(
  sub: SubLike,
  payload: PushPayload
): Promise<"ok" | "gone" | "error"> {
  if (!pushEnabled()) return "error";
  ensure();
  try {
    await webpush.sendNotification(
      { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
      JSON.stringify(payload),
      { timeout: PUSH_TIMEOUT_MS }
    );
    return "ok";
  } catch (e: unknown) {
    const code = (e as { statusCode?: number })?.statusCode;
    return code === 404 || code === 410 ? "gone" : "error";
  }
}
