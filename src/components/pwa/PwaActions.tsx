"use client";

import { useCallback, useEffect, useState } from "react";
import { track } from "@/lib/analytics";

/* eslint-disable @typescript-eslint/no-explicit-any */
// 浮动入口:「安装到桌面」+ 安装结果反馈。
// 成功以 `appinstalled` 事件为准(最可靠,含浏览器菜单安装路径);取消看 userChoice。
// iOS Safari 无 beforeinstallprompt:只能引导"添加到主屏幕",成功靠下次以 standalone 打开来确认。
type Toast = { ok: boolean; text: string } | null;

export function PwaActions() {
  const [deferred, setDeferred] = useState<any>(null);
  const [standalone, setStandalone] = useState(true);
  const [isIOS, setIsIOS] = useState(false);
  const [showIOSHint, setShowIOSHint] = useState(false);
  const [toast, setToast] = useState<Toast>(null);

  const flash = useCallback((t: NonNullable<Toast>) => {
    setToast(t);
    window.setTimeout(() => setToast(null), 3000);
  }, []);

  useEffect(() => {
    const mql = window.matchMedia("(display-mode: standalone)");
    setStandalone(mql.matches || (navigator as any).standalone === true);
    setIsIOS(/iphone|ipad|ipod/i.test(navigator.userAgent));

    const onBIP = (e: any) => {
      e.preventDefault();
      setDeferred(e);
    };
    // 安装真正落地(任何路径,包括浏览器三点菜单)
    const onInstalled = () => {
      setDeferred(null);
      setStandalone(true);
      setShowIOSHint(false);
      flash({ ok: true, text: "✅ 已添加到桌面,下次从图标直接打开" });
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
        // accepted 不在这里报成功:真正落地以 appinstalled 为准(系统弹窗可能再被取消)
        if (outcome === "dismissed") {
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
