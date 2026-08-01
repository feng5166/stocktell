"use client";

// 新手路径 v2 P1:aha 之后(本会话刚加过自选、即时关系卡已兑现)才张口要推送——
// 完全免登录:PushSubscription 只按 endpoint 存,游客也能收每日简报推送(D1 召回主钩子)。
// 克制规则:加票后延迟数秒出现;已订阅/不支持/权限已拒/关过(7 天冷却)都不弹;
// 与 GuestWatchlistNudge 互斥(本条优先,会话级标记)。
import { useEffect, useRef, useState } from "react";
import { track } from "@/lib/analytics";
import { pushSupported, getPushSubscription, enablePush } from "@/lib/web-push-client";
import { WATCH_ADDED_EVT } from "@/components/useWatchlist";

const DISMISS_KEY = "stocktell_push_nudge_at";
const COOLDOWN = 7 * 24 * 3600_000;
// 会话级互斥标记:GuestWatchlistNudge 看到它就本会话让位,避免底部双条叠罗汉
export const BOTTOM_NUDGE_FLAG = "stocktell_bottom_nudge";

export function AhaPushNudge() {
  const [show, setShow] = useState(false);
  const [state, setState] = useState<"idle" | "busy" | "done" | "failed">("idle");
  const timerRef = useRef<number | null>(null);

  useEffect(() => {
    const onAdd = () => {
      if (timerRef.current) return; // 已排过定时
      timerRef.current = window.setTimeout(async () => {
        try {
          if (!pushSupported()) return;
          if (Notification.permission === "denied") return;
          if (Date.now() - Number(localStorage.getItem(DISMISS_KEY) || 0) < COOLDOWN) return;
          if (await getPushSubscription()) return; // 已订阅不重复问
          sessionStorage.setItem(BOTTOM_NUDGE_FLAG, "1");
          setShow(true);
          track("push_nudge_view", {});
        } catch {
          /* 隐私模式等:不弹 */
        }
      }, 6000); // 给 InstantTake 的解读几秒钟先兑现价值,再张口
    };
    window.addEventListener(WATCH_ADDED_EVT, onAdd);
    return () => {
      window.removeEventListener(WATCH_ADDED_EVT, onAdd);
      if (timerRef.current) window.clearTimeout(timerRef.current);
    };
  }, []);

  if (!show) return null;

  const dismiss = () => {
    try {
      localStorage.setItem(DISMISS_KEY, String(Date.now()));
      sessionStorage.removeItem(BOTTOM_NUDGE_FLAG);
    } catch {
      /* ignore */
    }
    setShow(false);
  };

  const enable = async () => {
    setState("busy");
    const r = await enablePush();
    if (r.ok) {
      track("bind_push", { channel: "webpush", source: "aha_nudge" });
      setState("done");
      window.setTimeout(dismiss, 2500);
    } else {
      track("push_nudge_fail", { reason: r.reason ?? "unknown" });
      setState("failed");
      window.setTimeout(dismiss, 3500);
    }
  };

  return (
    <div className="fixed inset-x-0 z-40 bottom-[calc(3.5rem+env(safe-area-inset-bottom))] px-3 sm:bottom-4">
      <div className="mx-auto flex max-w-3xl items-center gap-2.5 rounded-xl border border-brand-200 bg-white/95 px-3.5 py-2.5 shadow-lg backdrop-blur">
        {state === "done" ? (
          <span className="text-sm text-gray-800">✅ 开好了,明早盘前见 👀</span>
        ) : state === "failed" ? (
          <span className="text-sm text-gray-600">没开成也没关系,随时可在设置里再开。</span>
        ) : (
          <>
            <span className="text-sm leading-snug text-gray-800">
              ⏰ 明早盘前会生成你这几只票的解读,要提醒你吗?免登录。
            </span>
            <button
              onClick={enable}
              disabled={state === "busy"}
              className="ml-auto shrink-0 rounded-lg bg-brand-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-brand-700 disabled:opacity-50"
            >
              {state === "busy" ? "开启中…" : "开启提醒"}
            </button>
            <button
              onClick={dismiss}
              aria-label="关闭"
              className="shrink-0 rounded-full p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
            >
              <svg viewBox="0 0 20 20" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8">
                <path d="M6 6l8 8M14 6l-8 8" strokeLinecap="round" />
              </svg>
            </button>
          </>
        )}
      </div>
    </div>
  );
}
