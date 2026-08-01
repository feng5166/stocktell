"use client";

// 新手路径 v2:新访客首屏重排。无自选的访客先看「今日最重要的因果链」(产品先表演),
// 盘面情绪/雷达(对小白是黑话)后移;老访客/有自选维持负责人 2026-07-09 拍板的
// 盘面在前顺序。两个槽位都是服务端渲染好的节点,这里只翻转顺序,不复制任何标记。
// SSR 与水合前渲染常规顺序,新访客水合后翻转(一次轻微 reflow,换首屏叙事成立)。
import type { ReactNode } from "react";
import { useWatchlist } from "@/components/useWatchlist";

export function FirstRunReorder({ demo, market }: { demo: ReactNode; market: ReactNode }) {
  const wl = useWatchlist();
  const firstRun = wl.ready && wl.codes.size === 0;
  return firstRun ? (
    <>
      {demo}
      {market}
    </>
  ) : (
    <>
      {market}
      {demo}
    </>
  );
}
