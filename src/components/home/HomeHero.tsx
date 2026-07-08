"use client";

// 首屏 Hero(2026-07-08 首页改版:一屏一个核心判断)。
// 结构:主标题 → 生成口径副题 → 【今日总判断】卡(主线一句话 + 三个小指标)→ 双 CTA。
// 埋点与 CTA 三态逻辑(拍板⑩)原样保留:主 CTA 滚 #mine,次 CTA 直达 insight。
import Link from "next/link";
import { useEffect, useRef } from "react";
import { useSession } from "next-auth/react";
import { FeedbackLink } from "@/components/FeedbackLink";
import { useWatchlist } from "@/components/useWatchlist";
import { track } from "@/lib/analytics";

export interface HeroMetrics {
  events: number; // 今日事件条数
  triggeredChains: number; // 今日有触发的链
  totalChains: number;
  pending: number; // 待验证关系(静态 candidate 档)
}

export function HomeHero({
  shownDate,
  insightHref,
  judgment,
  metrics,
}: {
  shownDate: string;
  insightHref: string | null;
  judgment: string | null; // 今日总判断(主链 chain-take;null=生成中)
  metrics: HeroMetrics;
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
    <div className="mb-8">
      <div className="flex items-center gap-2.5">
        <h1 className="text-h1 font-semibold tracking-tight">今日产业链推理</h1>
        <FeedbackLink />
      </div>
      <p className="mt-1.5 text-xs leading-relaxed text-gray-400">
        {shownDate} · 基于隔夜海外事件、产业链关系库与人工审阅生成
      </p>

      {/* 今日总判断:首屏唯一的核心信息,用户第一眼先抓这里 */}
      <div className="mt-4 rounded-xl border-t-2 border-violet-400 bg-white p-4 shadow-sm sm:p-5">
        <div className="text-meta font-medium text-violet-600">今日主线</div>
        {judgment ? (
          <p className="mt-1.5 text-[15px] font-medium leading-relaxed text-gray-900">{judgment}</p>
        ) : (
          <p className="mt-1.5 text-sm leading-relaxed text-gray-400">
            今日判断生成中(每个交易日约 07:00 更新),先看下方各链传导结构。
          </p>
        )}
        <div className="mt-3 flex flex-wrap gap-x-6 gap-y-2 border-t border-gray-100 pt-3">
          {[
            ["今日事件", `${metrics.events} 条`],
            ["触发链", `${metrics.triggeredChains}/${metrics.totalChains} 条`],
            ["待验证关系", `${metrics.pending} 条`],
          ].map(([k, v]) => (
            <div key={k}>
              <span className="text-meta text-gray-400">{k}</span>
              <span className="ml-1.5 text-sm font-semibold tabular-nums text-gray-800">{v}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="mt-3.5 flex flex-wrap gap-2">
        <button
          onClick={goMine}
          className="inline-flex min-h-[40px] items-center gap-1 rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-brand-700"
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
