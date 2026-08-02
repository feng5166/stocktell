"use client";

// 首页「生成今日情绪卡」入口(2.3 P0-3,viral-growth-plan 环①):
// 固定在「AI链今日情绪」模块右下,每个交易日打开即见。克制文字链接,不抢主内容。
import Link from "next/link";
import { track } from "@/lib/analytics";

export function ShareCardEntry() {
  return (
    <Link
      href="/share/sentiment"
      onClick={() => track("share_card_entry_click", { from: "home" })}
      className="inline-flex items-center gap-1 whitespace-nowrap text-xs font-medium text-gray-500 hover:text-gray-800 hover:underline"
    >
      生成今日情绪卡 →
    </Link>
  );
}
