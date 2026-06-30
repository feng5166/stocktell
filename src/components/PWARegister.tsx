"use client";

import { useEffect, useState } from "react";

// 注册 Service Worker(仅生产 + 支持时),启用 PWA 可安装与离线回退。
// 新版本上线后给"刷新"提示——否则用户会卡在旧版本(PWA 经典坑)。
export function PWARegister() {
  const [updateReady, setUpdateReady] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!("serviceWorker" in navigator)) return;
    // 开发环境不注册,避免旧缓存干扰本地调试("改了不生效")
    if (process.env.NODE_ENV !== "production") {
      navigator.serviceWorker
        .getRegistrations?.()
        .then((rs) => rs.forEach((r) => r.unregister()))
        .catch(() => {});
      return;
    }

    let reg: ServiceWorkerRegistration | null = null;
    const onLoad = async () => {
      try {
        // updateViaCache:none —— 永远从网络拿最新 sw.js,别走 HTTP 缓存
        reg = await navigator.serviceWorker.register("/sw.js", {
          updateViaCache: "none",
        });
        // 新 worker 装好且已有旧 worker 在控制 = 这是一次"更新",提示刷新
        reg.addEventListener("updatefound", () => {
          const sw = reg!.installing;
          if (!sw) return;
          sw.addEventListener("statechange", () => {
            if (sw.state === "installed" && navigator.serviceWorker.controller) {
              setUpdateReady(true);
            }
          });
        });
      } catch (e) {
        console.warn("[pwa] SW 注册失败", e);
      }
    };
    window.addEventListener("load", onLoad);
    return () => window.removeEventListener("load", onLoad);
  }, []);

  if (!updateReady) return null;
  return (
    <button
      onClick={() => window.location.reload()}
      className="fixed inset-x-0 bottom-14 z-[101] mx-auto block w-fit rounded-full bg-gray-900 px-4 py-2 text-xs font-medium text-white shadow-lg sm:bottom-4"
    >
      ✨ 有新版本 · 点此刷新
    </button>
  );
}
