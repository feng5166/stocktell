"use client";

// 长列表渐进渲染:初始只显示 step 条,滚到底(IntersectionObserver)再 +step。
// 用回调 ref(setSentinel),哨兵既可以是 <div> 也可以是 <tr>,表格/卡片都能复用。
import { useCallback, useEffect, useRef, useState } from "react";

export function useProgressive<T>(items: T[], step = 12) {
  const [visible, setVisible] = useState(step);
  const obs = useRef<IntersectionObserver | null>(null);

  const setSentinel = useCallback(
    (el: HTMLElement | null) => {
      obs.current?.disconnect();
      if (!el) return;
      obs.current = new IntersectionObserver(
        (entries) => {
          if (entries[0].isIntersecting) setVisible((v) => v + step);
        },
        { rootMargin: "300px" } // 提前 300px 预加载,滚动不卡顿
      );
      obs.current.observe(el);
    },
    [step]
  );

  useEffect(() => () => obs.current?.disconnect(), []);

  return {
    slice: items.slice(0, visible),
    hasMore: visible < items.length,
    shownCount: Math.min(visible, items.length),
    total: items.length,
    setSentinel,
  };
}
