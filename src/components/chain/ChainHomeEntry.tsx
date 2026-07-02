"use client";

// AI 链落地页(/chain/ai)小入口:放在"AI链今日情绪"模块头部靠右,灰色克制文字链接(不抢)。
// 埋点 chain_entry_click:看"首页 → 落地页"漏斗第一跳。
import Link from "next/link";
import { track } from "@/lib/analytics";

export function ChainHomeEntry() {
  return (
    <Link
      href="/chain/ai"
      onClick={() => track("chain_entry_click", { from: "home" })}
      className="inline-flex items-center gap-1 whitespace-nowrap text-xs font-medium text-gray-500 hover:text-gray-800 hover:underline"
    >
      详细情绪 →
    </Link>
  );
}
