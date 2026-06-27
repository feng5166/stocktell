import webpush from "web-push";

const PUB = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
const PRIV = process.env.VAPID_PRIVATE_KEY;
const SUBJECT = process.env.VAPID_SUBJECT || "mailto:noreply@stocktell.me";

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
      JSON.stringify(payload)
    );
    return "ok";
  } catch (e: unknown) {
    const code = (e as { statusCode?: number })?.statusCode;
    return code === 404 || code === 410 ? "gone" : "error";
  }
}
