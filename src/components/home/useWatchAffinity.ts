"use client";

// 自选→板块/链 亲和度(2.2.7):首页优先级由自选决定的客户端数据底。
// 首页是 ISR 全局缓存(大陆 TTFB 约定),个性化只能水合后做:SSR 先出全局排序,
// 客户端拿到自选再重排——无自选用户前后一致,零闪动。
import { useMemo } from "react";
import { useWatchlist } from "@/components/useWatchlist";
import { STOCK_MAP } from "@/data/stocks";
import { INTENT_SEGMENTS } from "@/lib/market-intent/segments";

export function useWatchAffinity() {
  const wl = useWatchlist();
  const codesKey = Array.from(wl.codes).sort().join(",");
  return useMemo(() => {
    const segCount = new Map<string, number>();
    const chainCount = new Map<string, number>();
    if (wl.ready) {
      for (const code of codesKey.split(",").filter(Boolean)) {
        const s = STOCK_MAP[code];
        if (!s || s.market !== "A股") continue;
        const seg = INTENT_SEGMENTS.find((x) => x.sectors.includes(s.sector));
        if (!seg) continue;
        segCount.set(seg.key, (segCount.get(seg.key) ?? 0) + 1);
        for (const sl of seg.chainSlugs) chainCount.set(sl, (chainCount.get(sl) ?? 0) + 1);
      }
    }
    return { ready: wl.ready, segCount, chainCount };
  }, [wl.ready, codesKey]);
}
