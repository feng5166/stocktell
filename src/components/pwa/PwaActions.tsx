"use client";

import { useEffect, useState } from "react";

const VAPID = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;

function urlB64ToUint8(base64: string): Uint8Array {
  const pad = "=".repeat((4 - (base64.length % 4)) % 4);
  const b64 = (base64 + pad).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(b64);
  const arr = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) arr[i] = raw.charCodeAt(i);
  return arr;
}

/* eslint-disable @typescript-eslint/no-explicit-any */
// 浮动入口:仅保留「安装到桌面」「开启浏览器通知」两个情境化引导。
// 微信 / 邮件推送已统一收进个人设置页(/settings)。
export function PwaActions() {
  const [deferred, setDeferred] = useState<any>(null);
  const [standalone, setStandalone] = useState(true);
  const [isIOS, setIsIOS] = useState(false);
  const [showIOSHint, setShowIOSHint] = useState(false);
  const [pushState, setPushState] = useState<"unsupported" | "default" | "granted" | "denied">("unsupported");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const sa =
      window.matchMedia("(display-mode: standalone)").matches ||
      (navigator as any).standalone === true;
    setStandalone(sa);
    setIsIOS(/iphone|ipad|ipod/i.test(navigator.userAgent));

    const onBIP = (e: any) => {
      e.preventDefault();
      setDeferred(e);
    };
    window.addEventListener("beforeinstallprompt", onBIP);

    if ("serviceWorker" in navigator && "PushManager" in window && "Notification" in window && VAPID) {
      setPushState(Notification.permission as any);
    }
    return () => window.removeEventListener("beforeinstallprompt", onBIP);
  }, []);

  async function install() {
    if (deferred) {
      deferred.prompt();
      await deferred.userChoice;
      setDeferred(null);
    } else if (isIOS) {
      setShowIOSHint((v) => !v);
    }
  }

  async function enablePush() {
    setBusy(true);
    try {
      const perm = await Notification.requestPermission();
      setPushState(perm as any);
      if (perm !== "granted" || !VAPID) return;
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlB64ToUint8(VAPID) as BufferSource,
      });
      await fetch("/api/push/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(sub.toJSON()),
      });
    } finally {
      setBusy(false);
    }
  }

  const showInstall = !standalone && (deferred || isIOS);
  // push:default 才提示开启;iOS 必须已安装(standalone)才支持
  const showPushBtn = pushState === "default" && (isIOS ? standalone : true);

  if (!showInstall && !showPushBtn) return null;

  return (
    <div className="fixed right-4 top-[72px] z-[90] flex flex-col items-end gap-2 sm:bottom-4 sm:top-auto">
      {showIOSHint && (
        <div className="max-w-[240px] rounded-lg bg-gray-900 px-3 py-2 text-xs leading-relaxed text-white shadow-lg">
          用 <b>Safari</b> 打开 → 点底部<b>分享</b>按钮 → 选<b>「添加到主屏幕」</b>,即可像 App 一样使用。
        </div>
      )}
      {showInstall && (
        <button
          onClick={install}
          className="rounded-full bg-gray-900 px-4 py-2 text-xs font-medium text-white shadow-lg hover:bg-gray-700"
        >
          📲 安装到桌面
        </button>
      )}
      {showPushBtn && (
        <button
          onClick={enablePush}
          disabled={busy}
          className="rounded-full bg-emerald-600 px-4 py-2 text-xs font-medium text-white shadow-lg hover:bg-emerald-700 disabled:opacity-60"
        >
          {busy ? "开启中…" : "🔔 开启每日推送"}
        </button>
      )}
    </div>
  );
}
