"use client";

// 今日最重要的因果链(首页改版 PRD §6.2):用因果链卡替代新闻流,首页从
// "资讯列表"升级成"推理入口"。结构字段来自 insight(评审过的骨架),
// 今日字段来自 chain-take(07:01 生成)。整卡可点 → /insight/[slug]。
import Link from "next/link";
import { useEffect, useRef } from "react";
import { track } from "@/lib/analytics";
import type { HomeReasoningCard } from "@/lib/home-feed";
import { REL_CHIP_CLS_SHORT } from "@/lib/relation-rank";

export function ReasoningCards({ cards }: { cards: HomeReasoningCard[] }) {
  if (cards.length === 0) return null;
  return (
    <section id="reasoning" className="mt-2">
      <div className="flex items-baseline justify-between">
        <h2 className="text-h2 font-semibold text-gray-900">今日最重要的因果链</h2>
        <span className="text-xs text-gray-400">从全球事件到 A 股映射</span>
      </div>
      <div className="mt-3 space-y-3">
        {cards.map((c, i) => (
          <Card key={c.chainId} c={c} rank={i + 1} />
        ))}
      </div>
    </section>
  );
}

function Card({ c, rank }: { c: HomeReasoningCard; rank: number }) {
  const ref = useRef<HTMLDivElement>(null);
  const viewed = useRef(false);

  // 曝光埋点:进入视口一次(PRD §10.3)
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const obs = new IntersectionObserver((entries) => {
      if (entries[0].isIntersecting && !viewed.current) {
        viewed.current = true;
        track("home_reasoning_card_view", {
          insight_id: c.insightSlug,
          chain_id: c.chainId,
          rank,
        });
        obs.disconnect();
      }
    });
    obs.observe(el);
    return () => obs.disconnect();
  }, [c.chainId, c.insightSlug, rank]);

  const onClick = () =>
    track("home_reasoning_card_click", {
      insight_id: c.insightSlug,
      chain_id: c.chainId,
      rank,
    });

  return (
    <div ref={ref}>
      {/* 首页主卡:比事件卡重一级(品牌描边),内部三段=判断/三层关系/一句话风险(评审压缩版) */}
      <Link
        href={`/insight/${c.insightSlug}`}
        onClick={onClick}
        className="block rounded-xl bg-white p-4 shadow-sm ring-1 ring-brand-100 transition-shadow hover:shadow"
      >
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="flex flex-wrap items-center gap-1.5">
            <span className="rounded bg-brand-600 px-2 py-0.5 text-xs font-medium text-white">
              {c.chainName}
            </span>
            {c.trigger && (
              <span className="text-meta text-gray-400">今日触发:{c.trigger}</span>
            )}
          </span>
          <span className="shrink-0 text-meta text-gray-400">
            {c.stale ? `最近一期 · ${c.date.slice(5)}` : c.date.slice(5)}
          </span>
        </div>

        {c.humanSummary ? (
          <p className="mt-2 text-sm leading-relaxed text-gray-800">{c.humanSummary}</p>
        ) : (
          <p className="mt-2 text-sm leading-relaxed text-gray-400">
            今日判断生成中(每个交易日约 07:00 更新),先看这条链的传导结构 👇
          </p>
        )}

        {/* 三层关系:一条可换行的横排,压缩高度 */}
        <div className="mt-2 flex flex-wrap items-center gap-x-3.5 gap-y-1">
          {c.tiers.map((t, i) => (
            <span key={`${i}-${t.level}`} className="inline-flex items-center gap-1 text-xs">
              <span>{t.emoji}</span>
              <span
                className={`rounded px-1.5 py-0.5 text-[11px] font-medium ${
                  t.rel ? REL_CHIP_CLS_SHORT[t.rel] : "bg-gray-100 text-gray-500"
                }`}
              >
                {t.level}
              </span>
              <span className="font-medium text-gray-800">{t.what}</span>
            </span>
          ))}
        </div>

        <p className="mt-2 rounded-lg bg-rose-50/70 px-3 py-1.5 text-xs leading-relaxed text-rose-800">
          <span className="font-medium text-rose-600">⚠️ 一句话风险:</span>
          {c.risk}
        </p>

        <div className="mt-1.5 text-right text-xs font-medium text-brand-600">
          看这条链怎么传导 →
        </div>
      </Link>
    </div>
  );
}
