"use client";

// 首屏:今日产业链推理(首页改版 PRD §6.1)。
// 主 CTA 三态(拍板⑩+既有游客优先决策):全部滚到 #mine——游客在那里可直接加自选
// (localStorage,登录自动合并,GuestWatchlistNudge 负责后续引导登录),已登录无自选
// 看到 QuickAddWatch,有自选直达「和我相关」。不设登录墙,转化路径最短。
// 次 CTA 直达第一条 insight 因果链。
import Link from "next/link";
import { useEffect, useRef, type ReactNode } from "react";
import { useSession } from "next-auth/react";
import { FeedbackLink } from "@/components/FeedbackLink";
import { useWatchlist } from "@/components/useWatchlist";
import { track } from "@/lib/analytics";

export function HomeHero({
  shownDate,
  insightHref,
  dataNote,
  judgment,
}: {
  shownDate: string;
  insightHref: string | null;
  dataNote?: string; // 数据更新说明(如「8/13 盘后」)
  judgment?: ReactNode;
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
    <section className="home-hero-grid relative mb-5 overflow-hidden rounded-[28px] px-5 py-7 sm:px-8 sm:py-10 lg:px-10">
      <div className={`relative z-10 grid items-center gap-7 ${judgment ? "lg:grid-cols-[0.9fr_1.25fr] lg:gap-10" : "max-w-2xl"}`}>
        <div>
          <div className="flex items-center gap-2.5 text-meta font-medium text-[#7468f2]">
            <span>每日一页 AI 推理</span>
            <FeedbackLink />
          </div>
          <h1 className="mt-3 text-[34px] font-semibold leading-[1.12] tracking-[-0.035em] text-[#171a21] sm:text-[42px] lg:text-[48px]">
            今日产业链推理
          </h1>
          <p className="mt-3 text-[18px] leading-relaxed text-gray-600">
            全球事件如何传导到 A 股产业链
          </p>
          <p className="mt-1 max-w-md text-[13px] leading-[1.8] text-gray-500">
            把新闻、产业链、资金面和验证线索放在同一个视角里，减少盲猜，先理解再决策。
          </p>
          {!judgment && (
            <div className="mt-3 flex flex-wrap items-center gap-2 text-meta text-gray-500">
              <span>{shownDate}{dataNote ? ` · 数据更新 ${dataNote}` : ""}</span>
              <Link href="/chains" className="font-medium text-gray-700 hover:underline">全部产业链 →</Link>
            </div>
          )}
          <div className="mt-5 flex flex-wrap gap-2.5">
        <button
          onClick={goMine}
              className="inline-flex min-h-[44px] items-center gap-2 rounded-xl bg-[#171a21] px-5 py-2.5 text-sm font-medium text-white shadow-[0_8px_24px_rgba(23,26,33,0.16)] transition hover:-translate-y-0.5 hover:bg-[#292d36]"
        >
              添加自选，查看和我相关 <span aria-hidden>→</span>
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
                className="inline-flex min-h-[44px] items-center gap-2 rounded-xl border border-white/80 bg-white/90 px-5 py-2.5 text-sm font-medium text-gray-800 shadow-[0_6px_20px_rgba(31,35,48,0.06)] transition hover:-translate-y-0.5 hover:bg-white"
          >
            查看今日完整因果链 →
          </Link>
        )}
          </div>
          <div className="mt-5 flex flex-wrap gap-2 text-meta font-medium">
            <span className="rounded-full bg-[#fff0f2] px-3 py-1 text-[#d94758]">市场情绪</span>
            <span className="rounded-full bg-[#e9fbf5] px-3 py-1 text-[#148662]">自选相关</span>
            <span className="rounded-full bg-[#efedff] px-3 py-1 text-[#6558dd]">AI 解读</span>
          </div>
        </div>
        {judgment && (
          <div className="min-w-0">
            {judgment}
            <div className="mt-3 flex flex-wrap items-center justify-between gap-2 px-1 text-meta text-gray-500">
              <span>{shownDate}{dataNote ? ` · 数据更新 ${dataNote}` : ""}</span>
              <Link href="/chains" className="font-medium text-gray-700 hover:underline">
                全部产业链 →
              </Link>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
