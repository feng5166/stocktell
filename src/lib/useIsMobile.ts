import { useEffect, useState } from "react";

// 断点判定(默认 639.98px,与 Tailwind sm=min-width:640px 严格互补,消除 (639,640) 分数像素缝隙)。
// initial:SSR 端按 UA 预判的初值,让首帧就只渲染命中的一套(零双 DOM、零闪、零水合失配);
//   传 null 则挂载前返回 null,调用方可回退"两套都渲染、靠 CSS 显隐"。
// 挂载后一律用 matchMedia 兜正(处理 UA 误判 / 窗口跨断点缩放)。
export function useIsMobile(
  initial: boolean | null = null,
  query = "(max-width: 639.98px)"
): boolean | null {
  const [isMobile, setIsMobile] = useState<boolean | null>(initial);
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
