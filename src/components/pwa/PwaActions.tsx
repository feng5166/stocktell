"use client";

import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";

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
export function PwaActions() {
  const { data: session } = useSession();
  const [deferred, setDeferred] = useState<any>(null);
  const [standalone, setStandalone] = useState(true);
  const [isIOS, setIsIOS] = useState(false);
  const [showIOSHint, setShowIOSHint] = useState(false);
  const [pushState, setPushState] = useState<"unsupported" | "default" | "granted" | "denied">("unsupported");
  const [busy, setBusy] = useState(false);

  // 微信推送相关状态
  const [wxBound, setWxBound] = useState<boolean | null>(null);
  const [wxToken, setWxToken] = useState<string | null>(null);
  const [wxBusy, setWxBusy] = useState(false);
  const [showWxModal, setShowWxModal] = useState(false);
  const [copied, setCopied] = useState(false);

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

  // 登录后查微信绑定状态
  useEffect(() => {
    if (!session?.user) {
      setWxBound(null);
      setWxToken(null);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/push/weixin-token");
        if (!res.ok) return;
        const data = await res.json();
        if (cancelled) return;
        if (data.bound) {
          setWxBound(true);
          setWxToken(null);
        } else {
          setWxBound(false);
          if (data.token) setWxToken(data.token);
        }
      } catch {
        /* 忽略 */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [session?.user]);

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

  async function openWxModal() {
    setShowWxModal(true);
    if (wxToken) return;
    setWxBusy(true);
    try {
      const res = await fetch("/api/push/weixin-token");
      if (!res.ok) return;
      const data = await res.json();
      if (data.bound) {
        setWxBound(true);
      } else if (data.token) {
        setWxToken(data.token);
      }
    } finally {
      setWxBusy(false);
    }
  }

  async function copyToken() {
    if (!wxToken) return;
    try {
      await navigator.clipboard.writeText(wxToken);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* 忽略 */
    }
  }

  async function unbindWx() {
    if (!confirm("确定取消微信推送吗?")) return;
    setWxBusy(true);
    try {
      const res = await fetch("/api/push/unbind-weixin", { method: "DELETE" });
      if (res.ok) {
        setWxBound(false);
        setWxToken(null);
      }
    } finally {
      setWxBusy(false);
    }
  }

  const showInstall = !standalone && (deferred || isIOS);
  // push:default 才提示开启;iOS 必须已安装(standalone)才支持
  const showPushBtn = pushState === "default" && (isIOS ? standalone : true);
  const showWxBtn = !!session?.user && wxBound !== null;

  if (!showInstall && !showPushBtn && !showWxBtn) return null;

  return (
    <>
      <div className="fixed bottom-4 right-4 z-[90] flex flex-col items-end gap-2">
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
        {showWxBtn && wxBound === false && (
          <button
            onClick={openWxModal}
            disabled={wxBusy}
            className="rounded-full bg-green-600 px-4 py-2 text-xs font-medium text-white shadow-lg hover:bg-green-700 disabled:opacity-60"
          >
            💬 开启微信推送
          </button>
        )}
        {showWxBtn && wxBound === true && (
          <button
            onClick={unbindWx}
            disabled={wxBusy}
            className="rounded-full bg-gray-700 px-4 py-2 text-xs font-medium text-white shadow-lg hover:bg-gray-800 disabled:opacity-60"
          >
            ✓ 微信推送已开启
          </button>
        )}
      </div>

      {showWxModal && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 px-4"
          onClick={() => setShowWxModal(false)}
        >
          <div
            className="w-full max-w-sm rounded-2xl bg-white p-5 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between">
              <h3 className="text-base font-semibold text-gray-900">开启微信每日推送</h3>
              <button
                onClick={() => setShowWxModal(false)}
                className="text-gray-400 hover:text-gray-600"
                aria-label="关闭"
              >
                ✕
              </button>
            </div>

            <div className="mt-4 space-y-4 text-sm text-gray-700">
              <div>
                <div className="font-medium text-gray-800">1. 扫码添加 StockTell 助手</div>
                <div className="mt-2 flex justify-center">
                  <img
                    src="/clawbot-qr.png"
                    alt="StockTell 助手二维码"
                    className="h-40 w-40 rounded-lg border border-gray-200 bg-gray-50 object-contain"
                    onError={(e) => {
                      (e.currentTarget as HTMLImageElement).style.display = "none";
                    }}
                  />
                </div>
              </div>

              <div>
                <div className="font-medium text-gray-800">2. 将以下绑定码发给助手:</div>
                <div className="mt-2 flex items-center gap-2">
                  <div className="flex-1 rounded-lg border border-dashed border-gray-300 bg-gray-50 px-3 py-2 text-center font-mono text-lg tracking-widest text-gray-900">
                    {wxBusy && !wxToken ? "加载中…" : wxToken ?? "—"}
                  </div>
                  <button
                    onClick={copyToken}
                    disabled={!wxToken}
                    className="rounded-lg bg-emerald-600 px-3 py-2 text-xs font-medium text-white hover:bg-emerald-700 disabled:opacity-50"
                  >
                    {copied ? "已复制" : "复制"}
                  </button>
                </div>
                <div className="mt-1 text-xs text-gray-500">(10 分钟内有效)</div>
              </div>

              <p className="text-xs text-gray-500">
                绑定后每天只在你的自选有动静时提醒,没动静不打扰。
              </p>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
