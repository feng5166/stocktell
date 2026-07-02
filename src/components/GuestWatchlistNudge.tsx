"use client";

// 有自选的游客·登录轻推:游客零门槛加自选(利于首次转化)后,换页时用"已投入的自选"引导登录。
// 钩子=真价值(登录后每早盘前盯这些票的动态)+ 换设备不丢;可关闭、关掉 24h 内不再弹,不骚扰。
// 只读 localStorage 的游客自选(与 useWatchlist 同键);登录后(status!=unauthenticated)自动隐藏。
import { useEffect, useRef, useState } from "react";
import { useSession } from "next-auth/react";
import { usePathname } from "next/navigation";
import { useAuthModal } from "@/components/Providers";
import { track } from "@/lib/analytics";

const LS_WATCH = "stocktell_watchlist";
const LS_DISMISS = "stocktell_login_nudge_at";
const COOLDOWN = 24 * 60 * 60 * 1000; // 关掉后 24h 内不再弹

export function GuestWatchlistNudge() {
  const { status } = useSession();
  const pathname = usePathname();
  const { open: openAuth } = useAuthModal();
  const [show, setShow] = useState(false);
  const [count, setCount] = useState(0);
  const viewedRef = useRef(false);

  useEffect(() => {
    // 仅"确认未登录"的游客;loading/已登录都不弹
    if (status !== "unauthenticated") {
      setShow(false);
      return;
    }
    try {
      const wl = JSON.parse(localStorage.getItem(LS_WATCH) || "[]");
      const n = Array.isArray(wl) ? wl.length : 0;
      if (n === 0) {
        setShow(false);
        return;
      }
      const dismissedAt = Number(localStorage.getItem(LS_DISMISS) || 0);
      if (Date.now() - dismissedAt < COOLDOWN) {
        setShow(false);
        return;
      }
      setCount(n);
      setShow(true);
      if (!viewedRef.current) {
        viewedRef.current = true;
        track("login_nudge_view", { watchlist: n });
      }
    } catch {
      /* localStorage 不可用则不弹 */
    }
    // pathname 变化时复查:实现"加完后换页才提醒"(点★不换页,不会当场弹)
  }, [status, pathname]);

  if (!show) return null;

  const dismiss = () => {
    try {
      localStorage.setItem(LS_DISMISS, String(Date.now()));
    } catch {
      /* 忽略 */
    }
    setShow(false);
  };
  const login = () => {
    track("login_nudge_click", { watchlist: count });
    openAuth(
      `登录/注册,把你自选的 ${count} 只票绑到账号——每个交易日早盘前收到它们的相关动态,换设备也不丢。`
    );
  };

  return (
    <div className="fixed inset-x-0 z-40 bottom-[calc(3.5rem+env(safe-area-inset-bottom))] px-3 sm:bottom-4">
      <div className="mx-auto flex max-w-3xl items-center gap-2.5 rounded-xl border border-amber-200 bg-amber-50/95 px-3.5 py-2.5 shadow-lg backdrop-blur">
        <span className="text-sm leading-snug text-amber-900">
          ★ 已自选 {count} 只 · 登录后每个交易日早盘前帮你盯它们的动态,换设备也不丢
        </span>
        <button
          onClick={login}
          className="ml-auto shrink-0 rounded-lg bg-gray-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-gray-700"
        >
          登录
        </button>
        <button
          onClick={dismiss}
          aria-label="关闭"
          className="shrink-0 rounded-full p-1 text-amber-700/70 hover:bg-amber-100 hover:text-amber-900"
        >
          <svg viewBox="0 0 20 20" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8">
            <path d="M6 6l8 8M14 6l-8 8" strokeLinecap="round" />
          </svg>
        </button>
      </div>
    </div>
  );
}
