"use client";

import { useEffect } from "react";

// 注册 Service Worker(仅生产 + 支持时),启用 PWA 可安装与离线回退。
export function PWARegister() {
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!("serviceWorker" in navigator)) return;
    const onLoad = () => {
      navigator.serviceWorker.register("/sw.js").catch(() => {});
    };
    window.addEventListener("load", onLoad);
    return () => window.removeEventListener("load", onLoad);
  }, []);
  return null;
}
