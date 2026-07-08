"use client";

// 首屏:今日产业链推理(首页改版 PRD §6.1)。
// 主 CTA 三态(拍板⑩+既有游客优先决策):全部滚到 #mine——游客在那里可直接加自选
// (localStorage,登录自动合并,GuestWatchlistNudge 负责后续引导登录),已登录无自选
// 看到 QuickAddWatch,有自选直达「和我相关」。不设登录墙,转化路径最短。
// 次 CTA 直达第一条 insight 因果链。
import Link from "next/link";
import { useEffect, useRef } from "react";
import { useSession } from "next-auth/react";
import { FeedbackLink } from "@/components/FeedbackLink";
import { useWatchlist } from "@/components/useWatchlist";
import { track } from "@/lib/analytics";

export function HomeHero({
  shownDate,
  insightHref,
}: {
  shownDate: string;
  insightHref: string | null;
}) {
  const { status } = useSession();
  const wl = useWatchlist();
  const viewed = useRef(false);

  const userStatus = status === "authenticated" ? "logged_in" : "guest";
  const hasWatchlist = wl.codes.size > 0;

  // home_view:会话态与自选态就绪后上报一次(PRD §10.1)
  useEffect(() => {
    if (viewed.current || status === "loading" || !wl.ready) return;
    viewed.current = true;
    track("home_view", {
      date: shownDate,
      user_status: userStatus,
      has_watchlist: hasWatchlist,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status, wl.ready]);

  const goMine = () => {
    track("home_cta_add_watchlist_click", {
      source_module: "hero",
      user_status: userStatus,
      has_watchlist: hasWatchlist,
    });
    document
      .getElementById("mine")
      ?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  return (
    <div className="mb-5">
      <div className="flex items-center gap-2.5">
        <h1 className="text-h1 font-semibold tracking-tight">今日产业链推理</h1>
        <FeedbackLink />
      </div>
      <p className="mt-1.5 text-sm leading-relaxed text-gray-600">
        昨晚海外发生了什么,今天会传到 A 股哪些链?StockTell 帮你拆开看。
      </p>
      <p className="mt-1 text-xs leading-relaxed text-gray-400">
        从一个全球事件出发,拆出它影响的产业链、A 股映射和最容易看错的地方 · {shownDate}
      </p>
      <div className="mt-3.5 flex flex-wrap gap-2">
        <button
          onClick={goMine}
          className="inline-flex min-h-[40px] items-center gap-1 rounded-lg bg-gray-900 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-gray-800"
        >
          ⭐ 添加自选,查看和我相关
        </button>
        {insightHref && (
          <Link
            href={insightHref}
            onClick={() =>
              track("home_cta_view_insight_click", {
                source_module: "hero",
                user_status: userStatus,
                has_watchlist: hasWatchlist,
              })
            }
            className="inline-flex min-h-[40px] items-center gap-1 rounded-lg bg-white px-4 py-2 text-sm font-medium text-gray-700 shadow-sm transition-colors hover:bg-gray-50"
          >
            查看今日完整因果链 →
          </Link>
        )}
      </div>
    </div>
  );
}
