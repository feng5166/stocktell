"use client";

import { useEffect, useState } from "react";

/* eslint-disable @typescript-eslint/no-explicit-any */
// 浮动入口:只保留「安装到桌面」情境化引导。
// Web Push 已关闭(改由邮件 + 微信承载);微信/邮件推送在个人设置页管理。
export function PwaActions() {
  const [deferred, setDeferred] = useState<any>(null);
  const [standalone, setStandalone] = useState(true);
  const [isIOS, setIsIOS] = useState(false);
  const [showIOSHint, setShowIOSHint] = useState(false);

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

  const showInstall = !standalone && (deferred || isIOS);
  if (!showInstall) return null;

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
    </div>
  );
}
