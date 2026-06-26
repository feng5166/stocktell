"use client";

// 详情页/任意服务端页面里复用的"加自选"按钮(客户端孤岛)。
import { useWatchlist } from "@/components/useWatchlist";

export function WatchStar({ code }: { code: string }) {
  const wl = useWatchlist();
  const on = wl.has(code);
  return (
    <button
      onClick={() => wl.toggle(code)}
      className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
        on
          ? "border-amber-300 bg-amber-50 text-amber-700"
          : "border-gray-300 text-gray-500 hover:border-amber-300 hover:text-amber-600"
      }`}
    >
      {on ? "★ 已自选" : "☆ 加自选"}
    </button>
  );
}
