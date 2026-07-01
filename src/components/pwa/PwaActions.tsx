"use client";

import { useCallback, useEffect, useState } from "react";
import { track } from "@/lib/analytics";

/* eslint-disable @typescript-eslint/no-explicit-any */
// 浮动入口:「安装到桌面」+ 安装结果反馈。
// 成功以 `appinstalled` 事件为准;取消看 userChoice;iOS 走「添加到主屏幕」引导。
// 安卓坑:大陆网络下 Chrome 装 PWA 需联 Google WebAPK 铸包服务,常失败 → 退化成普通
// 快捷方式(从它打开是 Chrome 标签页、非 standalone),Chrome 会再次提示安装。
// 因「快捷方式」与「Chrome 新访问」无法从前端区分,故:一旦装过/点过"不再提示"就永久隐藏。
const TRIED_KEY = "pwa_install_tried";
const DISMISS_KEY = "pwa_install_dismissed";
type Toast = { ok: boolean; text: string } | null;

export function PwaActions() {
  const [deferred, setDeferred] = useState<any>(null);
  const [standalone, setStandalone] = useState(true);
  const [isIOS, setIsIOS] = useState(false);
  const [isAndroid, setIsAndroid] = useState(false);
  const [showIOSHint, setShowIOSHint] = useState(false);
  const [reprompt, setReprompt] = useState(false);
  const [hidden, setHidden] = useState(true); // 默认隐藏,挂载后按 localStorage 决定
  const [toast, setToast] = useState<Toast>(null);

  const flash = useCallback((t: NonNullable<Toast>) => {
    setToast(t);
    window.setTimeout(() => setToast(null), 4000);
  }, []);

  useEffect(() => {
    const mql = window.matchMedia("(display-mode: standalone)");
    setStandalone(mql.matches || (navigator as any).standalone === true);
    setIsIOS(/iphone|ipad|ipod/i.test(navigator.userAgent));
    setIsAndroid(/android/i.test(navigator.userAgent));
    try {
      // 装过 或 点过"不再提示" → 永久不再骚扰
      setHidden(
        !!localStorage.getItem(TRIED_KEY) || !!localStorage.getItem(DISMISS_KEY)
      );
    } catch {
      setHidden(false);
    }

    const onBIP = (e: any) => {
      e.preventDefault();
      setDeferred(e);
      try {
        if (localStorage.getItem(TRIED_KEY)) setReprompt(true);
      } catch {
        /* ignore */
      }
    };
    const markTried = () => {
      try {
        localStorage.setItem(TRIED_KEY, "1");
      } catch {
        /* ignore */
      }
      setHidden(true);
    };
    const onInstalled = () => {
      setDeferred(null);
      setStandalone(true);
      setShowIOSHint(false);
      markTried();
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
          setHidden(true); // 已发起安装,不再显示(无论 WebAPK 是否真正铸包成功)
        } else if (outcome === "dismissed") {
          flash({ ok: false, text: "已取消安装,可随时再点此添加" });
          track("pwa_install_dismissed");
        }
      } catch {
        /* 用户直接关弹窗 */
      } finally {
        setDeferred(null);
      }
    } else if (isIOS) {
      setShowIOSHint((v) => !v);
    }
  }

  function dismiss() {
    try {
      localStorage.setItem(DISMISS_KEY, "1");
    } catch {
      /* ignore */
    }
    setHidden(true);
  }

  const showInstall = !standalone && !hidden && (deferred || isIOS);
  if (!showInstall && !toast) return null;

  return (
    <div className="fixed right-4 top-[72px] z-30 flex flex-col items-end gap-2 sm:bottom-[calc(1rem+env(safe-area-inset-bottom,0px))] sm:top-auto">
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
      {/* 安卓:常驻引导用浏览器菜单(国内 WebAPK 常失败,菜单更稳);检测到反复提示时强调。
          仅真安卓显示——桌面(mac/win)装 PWA 很稳,不需要这段。 */}
      {showInstall && isAndroid && (
        <div className="max-w-[250px] rounded-lg bg-gray-900 px-3 py-2 text-xs leading-relaxed text-white shadow-lg">
          {reprompt ? "上次似乎没装上?" : "若点上方装不上或反复提示,"}
          国内安卓改用浏览器 <b>⋮ 菜单 →「添加到主屏幕」</b> 更稳。
        </div>
      )}
      {showIOSHint && (
        <div className="max-w-[240px] rounded-lg bg-gray-900 px-3 py-2 text-xs leading-relaxed text-white shadow-lg">
          用 <b>Safari</b> 打开 → 点底部<b>分享</b>按钮 → 选<b>「添加到主屏幕」</b>。
          添加后从主屏图标重新打开,本提示自动消失即表示成功。
        </div>
      )}
      {showInstall && (
        <div className="flex items-center gap-2">
          <button
            onClick={dismiss}
            className="inline-flex min-h-[36px] items-center rounded-full bg-white/80 px-3 py-1 text-[11px] text-gray-600 shadow hover:bg-white"
          >
            不再提示
          </button>
          <button
            onClick={install}
            className="inline-flex min-h-[36px] items-center rounded-full bg-gray-900 px-4 py-2 text-xs font-medium text-white shadow-lg hover:bg-gray-700"
          >
            📲 安装到桌面
          </button>
        </div>
      )}
    </div>
  );
}
