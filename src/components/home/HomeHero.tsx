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
  dataNote,
}: {
  shownDate: string;
  insightHref: string | null;
  dataNote?: string; // 数据更新说明(如「8/13 盘后」)
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
    <div className="mb-4">
      {/* 视觉优化(2026-08-14):Hero 压高——标题+一行副标,日期/更新时间/全部产业链收进同一条 meta 行 */}
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div className="flex items-center gap-2.5">
          {/* H1 = 24px Semibold(视觉规范五级排版的顶层) */}
          <h1 className="text-2xl font-semibold tracking-tight text-[#202431]">今日产业链推理</h1>
          <FeedbackLink />
        </div>
        <span className="flex items-center gap-2 text-xs text-gray-400">
          <span>{shownDate}</span>
          {dataNote && <span>· 数据更新 {dataNote}</span>}
          <Link href="/chains" className="font-medium text-brand-600 hover:underline">
            全部产业链 →
          </Link>
        </span>
      </div>
      <p className="mt-1 text-xs leading-relaxed text-gray-400">
        全球事件如何传导到 A 股产业链——核心逻辑与资金动向
      </p>
      <div className="mt-3 flex flex-wrap gap-2">
        {/* 主按钮=品牌色唯一实色位(视觉规范:品牌色只做强调,主按钮/链接/active) */}
        <button
          onClick={goMine}
          className="inline-flex min-h-[40px] items-center gap-1 rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-brand-700"
        >
          添加自选,查看和我相关
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
            className="inline-flex min-h-[40px] items-center gap-1 rounded-lg border border-gray-200 bg-white px-4 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50"
          >
            查看今日完整因果链 →
          </Link>
        )}
      </div>
    </div>
  );
}
