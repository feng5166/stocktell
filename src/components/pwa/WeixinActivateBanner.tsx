"use client";

// 站内"还差一步"提醒:用户扫了码但没在 ClawBot 发消息激活 → 微信渠道推不进(无法用微信提醒他),
// 所以只能在他下次回到网站时,用顶部提示条告诉他"去发条消息就好"。本次会话内可关闭,下次再来仍提醒。
import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";

const DISMISS_KEY = "wx-activate-banner-dismissed";

export function WeixinActivateBanner() {
  const { status } = useSession();
  const [show, setShow] = useState(false);

  useEffect(() => {
    if (status !== "authenticated") return;
    if (sessionStorage.getItem(DISMISS_KEY) === "1") return;
    let active = true;
    fetch("/api/push/weixin-status", { cache: "no-store" })
      .then((r) => r.json())
      .then((d) => {
        if (active && d?.ok && d.pendingActivation) setShow(true);
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [status]);

  if (!show) return null;

  return (
    <div className="bg-amber-50 px-4 py-2.5 text-center text-xs leading-relaxed text-amber-800 sm:text-sm">
      <span className="font-medium">微信推送还差一步</span> —— 你已扫码,只需在微信里打开{" "}
      <b>ClawBot</b> 发<b>任意一句话</b>就能激活(微信限制:必须你先发消息,推送才进得来)。
      <button
        onClick={() => {
          setShow(false);
          try {
            sessionStorage.setItem(DISMISS_KEY, "1");
          } catch {
            /* 忽略 */
          }
        }}
        className="ml-2 rounded px-1.5 py-0.5 font-medium text-amber-700 underline-offset-2 hover:underline"
        aria-label="关闭提示"
      >
        知道了
      </button>
    </div>
  );
}
