"use client";

import { useEffect, useState } from "react";

export function OfflineBanner() {
  const [offline, setOffline] = useState(false);

  useEffect(() => {
    const update = () => setOffline(!navigator.onLine);
    update();
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    return () => {
      window.removeEventListener("online", update);
      window.removeEventListener("offline", update);
    };
  }, []);

  if (!offline) return null;
  return (
    <div className="fixed inset-x-0 top-0 z-[100] bg-amber-500 px-4 py-1.5 pt-[calc(0.375rem+env(safe-area-inset-top,0px))] text-center text-xs font-medium text-white">
      ⚠️ 当前离线 · 显示的是缓存内容,行情/简报可能不是最新
    </div>
  );
}
