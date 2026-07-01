import { useEffect, useState } from "react";

// 断点判定(默认 639.98px,与 Tailwind sm=min-width:640px 严格互补,消除 (639,640) 分数像素缝隙)。
// 挂载前返回 null:调用方据此在首帧照旧渲染两套(CSS 控制显隐),避免 SSR/水合失配与闪动;
// 挂载后返回真实布尔,调用方可只渲染命中的一套以减 DOM。
export function useIsMobile(query = "(max-width: 639.98px)"): boolean | null {
  const [isMobile, setIsMobile] = useState<boolean | null>(null);
  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return;
    const mql = window.matchMedia(query);
    const update = () => setIsMobile(mql.matches);
    update();
    mql.addEventListener?.("change", update);
    return () => mql.removeEventListener?.("change", update);
  }, [query]);
  return isMobile;
}
