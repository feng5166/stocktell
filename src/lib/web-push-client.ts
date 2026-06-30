// 浏览器端 Web Push 订阅助手:请求通知权限 → PushManager 订阅 → 存到服务端。
// 仅在生产 + 注册了 Service Worker 的环境可用(开发环境 PWARegister 不注册 SW)。
const PUB = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;

// 当前浏览器是否具备 Web Push 能力(iOS Safari 仅在「添加到主屏幕」后才有 PushManager)。
export function pushSupported(): boolean {
  return (
    typeof window !== "undefined" &&
    "serviceWorker" in navigator &&
    "PushManager" in window &&
    "Notification" in window
  );
}

function urlBase64ToUint8Array(base64: string): Uint8Array {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const b64 = (base64 + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(b64);
  const arr = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) arr[i] = raw.charCodeAt(i);
  return arr;
}

export async function getPushSubscription(): Promise<PushSubscription | null> {
  if (!pushSupported()) return null;
  try {
    const reg = await navigator.serviceWorker.ready;
    return await reg.pushManager.getSubscription();
  } catch {
    return null;
  }
}

export type EnableReason = "unsupported" | "no-key" | "denied" | "dismissed" | "save-failed";

// 开启:请求权限 → 订阅 → POST 存库。返回 {ok} 或失败原因。
export async function enablePush(): Promise<{ ok: boolean; reason?: EnableReason }> {
  if (!pushSupported()) return { ok: false, reason: "unsupported" };
  if (!PUB) return { ok: false, reason: "no-key" };
  const perm = await Notification.requestPermission();
  if (perm !== "granted") {
    return { ok: false, reason: perm === "denied" ? "denied" : "dismissed" };
  }
  const reg = await navigator.serviceWorker.ready;
  let sub = await reg.pushManager.getSubscription();
  if (!sub) {
    sub = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(PUB) as BufferSource,
    });
  }
  const r = await fetch("/api/push/subscribe", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(sub), // PushSubscription.toJSON() → {endpoint, keys:{p256dh,auth}}
  });
  if (!r.ok) return { ok: false, reason: "save-failed" };
  return { ok: true };
}

// 关闭:服务端删订阅 + 浏览器侧 unsubscribe。
export async function disablePush(): Promise<void> {
  const sub = await getPushSubscription();
  if (!sub) return;
  try {
    await fetch("/api/push/subscribe", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ endpoint: sub.endpoint }),
    });
  } catch {
    /* ignore */
  }
  try {
    await sub.unsubscribe();
  } catch {
    /* ignore */
  }
}
