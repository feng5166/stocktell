"use client";

// 新手路径 v2 P1:新访客(无自选)在首个"黑话卡"(ChainSentiment)之前给一条引桥——
// 先看今天最重要的一条因果链(产品自己先表演一次),而不是先被要求做事。
// 不重排/不折叠既有区块(v1 评审否决了布局分叉),只加一行,有自选后自动消失。
import Link from "next/link";
import { useWatchlist } from "@/components/useWatchlist";
import { track } from "@/lib/analytics";

export function FirstRunPromo({ insightHref }: { insightHref: string | null }) {
  const wl = useWatchlist();
  if (!wl.ready || wl.codes.size > 0 || !insightHref) return null;
  return (
    <Link
      href={insightHref}
      onClick={() => track("home_first_run_promo_click", {})}
      className="block rounded-xl border border-brand-100 bg-brand-50/60 px-3.5 py-2.5 text-sm leading-relaxed text-gray-800 transition-colors hover:bg-brand-50"
    >
      🧭 第一次来?先看<span className="font-semibold">今天最重要的一条因果链</span>
      ——一件全球大事怎么一步步传到 A 股。看完再回来加你的票。
      <span className="ml-1 font-medium text-brand-600">去看 →</span>
    </Link>
  );
}
