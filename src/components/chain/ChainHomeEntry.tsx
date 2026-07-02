"use client";

// 首页头部「看 / 分享」小入口 → AI 链落地页(/chain/ai)。克制不突兀:小号品牌色文字链接,
// 贴在"今日简报"标题行右侧、与 meta 行对齐。埋点 chain_entry_click:看"首页 → 落地页"漏斗第一跳。
import Link from "next/link";
import { track } from "@/lib/analytics";

export function ChainHomeEntry() {
  return (
    <Link
      href="/chain/ai"
      onClick={() => track("chain_entry_click", { from: "home" })}
      className="shrink-0 whitespace-nowrap text-xs font-medium text-brand-600 hover:underline"
    >
      看 / 分享 →
    </Link>
  );
}
