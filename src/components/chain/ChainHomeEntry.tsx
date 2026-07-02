"use client";

// 首页 → AI 链落地页(/chain/ai)入口 + 分享引导(分享机制 V1)。
// 埋点 chain_entry_click:看"首页 → 落地页 → 加自选/订阅/分享"这条漏斗的第一跳。
import Link from "next/link";
import { track } from "@/lib/analytics";

export function ChainHomeEntry() {
  return (
    <Link
      href="/chain/ai"
      onClick={() => track("chain_entry_click", { from: "home" })}
      className="mt-4 flex items-center gap-3 rounded-2xl bg-gradient-to-r from-brand-600 to-indigo-500 px-4 py-3.5 text-white shadow-sm transition-opacity hover:opacity-95"
    >
      <div className="min-w-0 flex-1">
        <div className="text-sm font-semibold">AI 产业链 · 今日解读</div>
        <div className="mt-0.5 text-xs text-white/85">
          隔夜联动 + 成分股一页看懂 · 分享给朋友,扫码即看
        </div>
      </div>
      <span className="shrink-0 rounded-lg bg-white/15 px-3 py-1.5 text-xs font-medium ring-1 ring-inset ring-white/25">
        看 / 分享 →
      </span>
    </Link>
  );
}
