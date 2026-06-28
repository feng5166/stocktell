"use client";

import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { useConfirm } from "@/components/ConfirmDialog";

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
  const confirm = useConfirm();
  const [deferred, setDeferred] = useState<any>(null);
  const [standalone, setStandalone] = useState(true);
  const [isIOS, setIsIOS] = useState(false);
  const [showIOSHint, setShowIOSHint] = useState(false);
  const [pushState, setPushState] = useState<"unsupported" | "default" | "granted" | "denied">("unsupported");
  const [busy, setBusy] = useState(false);

  // 微信推送相关状态
  const [wxBound, setWxBound] = useState<boolean | null>(null);
  const [wxBusy, setWxBusy] = useState(false);
  const [showWxModal, setShowWxModal] = useState(false);
  const [wxQrImg, setWxQrImg] = useState<string | null>(null);
  const [wxQrcode, setWxQrcode] = useState<string | null>(null);
  const [wxBindState, setWxBindState] = useState<"pending" | "scanned" | "activated" | "expired" | null>(null);

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
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/push/weixin-token");
        if (!res.ok) return;
        const data = await res.json();
        if (cancelled) return;
        setWxBound(!!data.bound);
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

  async function loadWxQr() {
    setWxBusy(true);
    try {
      const res = await fetch("/api/push/weixin-qr");
      const data = await res.json();
      if (data.bound) {
        setWxBound(true);
        return;
      }
      if (data.qrImg) {
        setWxQrImg(data.qrImg);
        setWxQrcode(data.qrcode);
        setWxBindState("pending");
      }
    } finally {
      setWxBusy(false);
    }
  }

  async function openWxModal() {
    setShowWxModal(true);
    if (wxBound || wxQrcode) return;
    await loadWxQr();
  }

  // 轮询绑定状态:pending → scanned(待发消息)→ activated;过期自动换码
  useEffect(() => {
    if (!showWxModal || !wxQrcode || wxBound) return;
    if (wxBindState === "activated") return;
    let cancelled = false;
    const timer = setInterval(async () => {
      try {
        const res = await fetch(`/api/push/weixin-qr-status?qrcode=${encodeURIComponent(wxQrcode)}`);
        const data = await res.json();
        if (cancelled) return;
        if (data.state === "expired") {
          setWxQrcode(null);
          setWxQrImg(null);
          await loadWxQr();
        } else if (data.state === "activated") {
          setWxBindState("activated");
          setWxBound(true);
        } else {
          setWxBindState(data.state);
        }
      } catch {
        /* 忽略 */
      }
    }, 2500);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [showWxModal, wxQrcode, wxBindState, wxBound]);

  function closeWxModal() {
    setShowWxModal(false);
    // 保留 wxBound;清理本次绑定会话
    if (!wxBound) {
      setWxQrcode(null);
      setWxQrImg(null);
      setWxBindState(null);
    }
  }

  async function unbindWx() {
    const ok = await confirm({
      title: "取消微信推送",
      message: "取消后将不再收到盘前早报和相关动态提醒,确定要取消吗?",
      confirmText: "确定取消",
      danger: true,
    });
    if (!ok) return;
    setWxBusy(true);
    try {
      const res = await fetch("/api/push/unbind-weixin", { method: "DELETE" });
      if (res.ok) {
        setWxBound(false);
        setWxQrcode(null);
        setWxQrImg(null);
        setWxBindState(null);
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
          onClick={closeWxModal}
        >
          <div
            className="w-full max-w-sm rounded-2xl bg-white p-5 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between">
              <h3 className="text-base font-semibold text-gray-900">开启微信每日推送</h3>
              <button
                onClick={closeWxModal}
                className="text-gray-400 hover:text-gray-600"
                aria-label="关闭"
              >
                ✕
              </button>
            </div>

            {wxBound ? (
              <div className="mt-6 text-center">
                <div className="text-3xl">✅</div>
                <p className="mt-2 text-sm font-medium text-gray-800">微信推送已开启</p>
                <p className="mt-1 text-xs text-gray-500">
                  每天早上只在你的自选有动静时提醒。记得每天打开 ClawBot 发条消息保持接收(微信限制 24 小时窗口)。
                </p>
              </div>
            ) : wxBindState === "activated" ? (
              <div className="mt-6 text-center">
                <div className="text-3xl">🎉</div>
                <p className="mt-2 text-sm font-medium text-gray-800">绑定成功!</p>
                <p className="mt-1 text-xs text-gray-500">以后每天早上有动静就会推到你微信。</p>
              </div>
            ) : (
              <div className="mt-4 space-y-4 text-sm text-gray-700">
                <div>
                  <div className="font-medium text-gray-800">
                    第一步:用微信「扫一扫」扫码
                  </div>
                  <div className="mt-2 flex justify-center">
                    {wxQrImg ? (
                      <img
                        src={`https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(wxQrImg)}`}
                        alt="绑定二维码"
                        className="h-48 w-48 rounded-lg bg-white shadow-sm object-contain"
                      />
                    ) : (
                      <div className="flex h-48 w-48 items-center justify-center rounded-lg border border-dashed border-gray-300 text-xs text-gray-400">
                        {wxBusy ? "二维码加载中…" : "二维码加载失败,请重开"}
                      </div>
                    )}
                  </div>
                  <div className="mt-1 text-center text-xs text-gray-400">二维码会自动刷新,无需担心过期</div>
                </div>

                <div>
                  <div className="font-medium text-gray-800">
                    第二步:在打开的 ClawBot 里<span className="text-emerald-600">发任意一句话</span>激活
                  </div>
                  <div className="mt-1 text-xs text-gray-500">
                    (微信限制:需你主动发一条消息,推送才能进得来)
                  </div>
                </div>

                <div className="rounded-lg bg-gray-50 px-3 py-2 text-center text-xs">
                  {wxBindState === "scanned" ? (
                    <span className="font-medium text-emerald-600">✓ 已扫码!请在 ClawBot 发一句话激活…</span>
                  ) : (
                    <span className="text-gray-500">等待扫码…</span>
                  )}
                </div>

                <p className="text-xs text-gray-400">
                  绑定后每天只在你的自选有动静时提醒,没动静不打扰。
                </p>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}
