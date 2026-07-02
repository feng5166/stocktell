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
      className="mt-4 flex items-center justify-between gap-3 rounded-xl border border-brand-100 bg-brand-50/50 px-4 py-3 transition-colors hover:bg-brand-50"
    >
      <div className="min-w-0">
        <div className="text-sm font-medium text-gray-900">AI 产业链 · 今日解读</div>
        <div className="mt-0.5 text-xs text-gray-500">
          隔夜联动 + 成分股一页看懂,分享给朋友扫码即看
        </div>
      </div>
      <span className="shrink-0 rounded-lg bg-brand-600 px-3 py-1.5 text-xs font-medium text-white">
        看 / 分享
      </span>
    </Link>
  );
}
