import { useEffect } from "react";

// 弹窗打开时锁定 <body> 背景滚动,关闭/卸载时还原原值。
// 传 active=false 可条件禁用(如弹窗未开)。用 overflow:hidden——
// 对本站这类短弹窗足够稳,且不像 position:fixed 方案那样丢失滚动位置。
export function useLockBodyScroll(active: boolean = true) {
  useEffect(() => {
    if (!active || typeof document === "undefined") return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [active]);
}
