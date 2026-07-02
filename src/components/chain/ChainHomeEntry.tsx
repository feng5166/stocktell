"use client";

// 首页「看 / 分享」小入口 → AI 链落地页(/chain/ai)。内联接在"今日简报"那行 meta 后面(小圆点分隔 +
// 品牌色文字),克制不突兀、连着内容走。埋点 chain_entry_click:看"首页 → 落地页"漏斗第一跳。
import Link from "next/link";
import { track } from "@/lib/analytics";

export function ChainHomeEntry() {
  return (
    <>
      <span className="mx-1.5 text-gray-300" aria-hidden>
        ·
      </span>
      <Link
        href="/chain/ai"
        onClick={() => track("chain_entry_click", { from: "home" })}
        className="whitespace-nowrap font-medium text-brand-600 hover:underline"
      >
        看 / 分享 →
      </Link>
    </>
  );
}
