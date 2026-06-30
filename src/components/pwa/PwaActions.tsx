"use client";

import { useCallback, useEffect, useState } from "react";
import { track } from "@/lib/analytics";

/* eslint-disable @typescript-eslint/no-explicit-any */
// 浮动入口:「安装到桌面」+ 安装结果反馈。
// 成功以 `appinstalled` 事件为准;取消看 userChoice;iOS 走「添加到主屏幕」引导。
// 安卓坑:大陆网络下 Chrome 装 PWA 需联 Google 的 WebAPK 铸包服务,常失败 → 退化成
// 普通快捷方式、下次仍提示安装。检测到"装过又被提示"就引导用菜单更稳。
const TRIED_KEY = "pwa_install_tried";
type Toast = { ok: boolean; text: string } | null;

export function PwaActions() {
  const [deferred, setDeferred] = useState<any>(null);
  const [standalone, setStandalone] = useState(true);
  const [isIOS, setIsIOS] = useState(false);
  const [showIOSHint, setShowIOSHint] = useState(false);
  const [reprompt, setReprompt] = useState(false); // 之前装过却又被提示 = 上次没真正装上
  const [toast, setToast] = useState<Toast>(null);

  const flash = useCallback((t: NonNullable<Toast>) => {
    setToast(t);
    window.setTimeout(() => setToast(null), 4000);
  }, []);

  useEffect(() => {
    const mql = window.matchMedia("(display-mode: standalone)");
    setStandalone(mql.matches || (navigator as any).standalone === true);
    setIsIOS(/iphone|ipad|ipod/i.test(navigator.userAgent));

    const onBIP = (e: any) => {
      e.preventDefault();
      setDeferred(e);
      // 上次尝试过安装、现在又能提示 = 上次没装上(安卓 WebAPK 失败常见)
      try {
        if (localStorage.getItem(TRIED_KEY)) setReprompt(true);
      } catch {
        /* ignore */
      }
    };
    const onInstalled = () => {
      setDeferred(null);
      setStandalone(true);
      setShowIOSHint(false);
      try {
        localStorage.setItem(TRIED_KEY, "1");
      } catch {
        /* ignore */
      }
      flash({ ok: true, text: "✅ 安装已发起 · 去桌面或应用列表找 StockTell 图标" });
      track("pwa_installed");
    };
    const onModeChange = (e: MediaQueryListEvent) => setStandalone(e.matches);

    window.addEventListener("beforeinstallprompt", onBIP);
    window.addEventListener("appinstalled", onInstalled);
    mql.addEventListener?.("change", onModeChange);
    return () => {
      window.removeEventListener("beforeinstallprompt", onBIP);
      window.removeEventListener("appinstalled", onInstalled);
      mql.removeEventListener?.("change", onModeChange);
    };
  }, [flash]);

  async function install() {
    if (deferred) {
      deferred.prompt();
      try {
        const { outcome } = await deferred.userChoice;
        if (outcome === "accepted") {
          try {
            localStorage.setItem(TRIED_KEY, "1");
          } catch {
            /* ignore */
          }
        } else if (outcome === "dismissed") {
          flash({ ok: false, text: "已取消安装,可随时再点此添加" });
          track("pwa_install_dismissed");
        }
      } catch {
        /* 用户直接关弹窗 */
      } finally {
        setDeferred(null); // prompt 只能用一次
      }
    } else if (isIOS) {
      setShowIOSHint((v) => !v);
    }
  }

  const showInstall = !standalone && (deferred || isIOS);
  if (!showInstall && !toast) return null;

  return (
    <div className="fixed right-4 top-[72px] z-[90] flex flex-col items-end gap-2 sm:bottom-4 sm:top-auto">
      {toast && (
        <div
          role="status"
          className={`max-w-[240px] rounded-lg px-3 py-2 text-xs leading-relaxed text-white shadow-lg ${
            toast.ok ? "bg-emerald-600" : "bg-gray-900"
          }`}
        >
          {toast.text}
        </div>
      )}
      {/* 安卓:上次没装上又被提示 → 引导用浏览器菜单(更稳,不依赖 WebAPK) */}
      {reprompt && !isIOS && (
        <div className="max-w-[240px] rounded-lg bg-gray-900 px-3 py-2 text-xs leading-relaxed text-white shadow-lg">
          上次似乎没装上?改用浏览器右上角 <b>⋮ 菜单 →「添加到主屏幕」</b> 更稳。
        </div>
      )}
      {showIOSHint && (
        <div className="max-w-[240px] rounded-lg bg-gray-900 px-3 py-2 text-xs leading-relaxed text-white shadow-lg">
          用 <b>Safari</b> 打开 → 点底部<b>分享</b>按钮 → 选<b>「添加到主屏幕」</b>。
          添加后从主屏图标重新打开,本提示自动消失即表示成功。
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
