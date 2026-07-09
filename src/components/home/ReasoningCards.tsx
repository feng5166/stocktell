"use client";

// 今日最重要的因果链(2026-07-08 首页改版:主次分层,不再三卡同权)。
// 主卡 = 第一条链(与 Hero 总判断同源):固定四行——这次变了什么 / 为什么会传导(链路流)/
// 对应环节 / 后续验证什么;风险行保留红(合规/风险是全站唯一允许的红)。
// 次卡 = 其余链:降权紧凑样式(标题 + 一行判断 + 环节 chips),桌面双列。
// 曝光/点击埋点原样保留。
import Link from "next/link";
import { useEffect, useRef } from "react";
import { track } from "@/lib/analytics";
import type { HomeReasoningCard } from "@/lib/home-feed";
import { REL_CHIP_CLS_SHORT } from "@/lib/relation-rank";

export function ReasoningCards({ cards }: { cards: HomeReasoningCard[] }) {
  if (cards.length === 0) return null;
  const [primary, ...rest] = cards;
  return (
    <section id="reasoning" className="mt-8">
      <div className="flex items-baseline justify-between">
        <h2 className="text-h2 font-semibold text-gray-900">今日最重要的因果链</h2>
        <span className="text-xs text-gray-400">从全球事件到 A 股映射</span>
      </div>
      <div className="mt-3">
        <PrimaryCard c={primary} />
      </div>
      {rest.length > 0 && (
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          {rest.map((c, i) => (
            <SecondaryCard key={c.chainId} c={c} rank={i + 2} />
          ))}
        </div>
      )}
    </section>
  );
}

function useCardTracking(c: HomeReasoningCard, rank: number) {
  const ref = useRef<HTMLDivElement>(null);
  const viewed = useRef(false);
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
  return { ref, onClick };
}

// 固定四行的行组件:标签冒号在前,内容在后
function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex gap-2 text-sm leading-relaxed">
      <span className="shrink-0 text-xs font-medium leading-6 text-gray-400">{label}</span>
      <div className="min-w-0 flex-1 text-gray-800">{children}</div>
    </div>
  );
}

function TierChips({ c }: { c: HomeReasoningCard }) {
  return (
    <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
      {c.tiers.map((t, i) => (
        <span key={`${i}-${t.level}`} className="inline-flex items-center gap-1 text-xs">
          <span>{t.emoji}</span>
          <span
            className={`rounded px-1.5 py-0.5 text-[11px] font-medium ${
              t.rel ? REL_CHIP_CLS_SHORT[t.rel] : "bg-amber-50 text-amber-700"
            }`}
          >
            {t.level}
          </span>
          <span className="font-medium text-gray-800">{t.what}</span>
        </span>
      ))}
    </span>
  );
}

function PrimaryCard({ c }: { c: HomeReasoningCard }) {
  const { ref, onClick } = useCardTracking(c, 1);
  return (
    <div ref={ref}>
      <Link
        href={`/insight/${c.insightSlug}`}
        onClick={onClick}
        className="relative block overflow-hidden rounded-2xl bg-white p-4 shadow-[0_24px_48px_-16px_rgba(23,25,60,.14),0_4px_12px_-4px_rgba(23,25,60,.06)] transition-shadow hover:shadow-[0_28px_56px_-16px_rgba(23,25,60,.2)] sm:p-5"
      >
        {/* 辉光顶缘(对齐稿定稿):青→紫→靛渐变 */}
        <span
          aria-hidden
          className="absolute inset-x-0 top-0 h-[3px]"
          style={{
            background: "linear-gradient(90deg,#22d3ee,#8b5cf6 40%,#4f46e5 90%)",
            filter: "drop-shadow(0 2px 10px rgba(139,92,246,.5))",
          }}
        />
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="flex flex-wrap items-center gap-1.5">
            <span className="rounded bg-brand-50 px-2 py-0.5 text-xs font-medium text-brand-700 ring-1 ring-brand-100">
              {c.chainName}
            </span>
            <span className="rounded bg-gradient-to-br from-brand-600 to-[#8b5cf6] px-2 py-0.5 text-[11px] font-medium text-white shadow-[0_3px_12px_-3px_rgba(124,90,255,.6)]">
              今日主线
            </span>
          </span>
          <span className="shrink-0 text-meta text-gray-400">
            {c.stale ? `最近一期 · ${c.date.slice(5)}` : c.date.slice(5)}
          </span>
        </div>

        <div className="mt-3 space-y-2">
          <Row label="这次变了什么">
            {c.trigger ?? c.humanSummary ?? "今日判断生成中(每个交易日约 07:00 更新)"}
          </Row>
          <Row label="为什么会传导">
            <span className="flex flex-wrap items-center gap-x-1.5 gap-y-1">
              {c.flow.map((node, i) => (
                <span key={`${i}-${node}`} className="inline-flex items-center gap-1.5">
                  {i > 0 && <span className="text-gray-300">→</span>}
                  <span className="rounded bg-gray-50 px-1.5 py-0.5 text-xs text-gray-700">{node}</span>
                </span>
              ))}
            </span>
          </Row>
          <Row label="对应哪些环节">
            <TierChips c={c} />
          </Row>
          <Row label="后续验证什么">
            <span className="text-gray-600">{c.verify.join(" / ")}</span>
          </Row>
        </div>

        {/* 风险/合规是全站唯一保留红色的场景(2026-07-08 色系拍板) */}
        <p className="mt-2.5 rounded-lg bg-rose-50/70 px-3 py-1.5 text-xs leading-relaxed text-rose-800">
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

function SecondaryCard({ c, rank }: { c: HomeReasoningCard; rank: number }) {
  const { ref, onClick } = useCardTracking(c, rank);
  return (
    <div ref={ref}>
      <Link
        href={`/insight/${c.insightSlug}`}
        onClick={onClick}
        className="block h-full rounded-xl bg-white p-4 shadow-sm ring-1 ring-gray-100 transition-all hover:-translate-y-0.5 hover:shadow-md"
      >
        <div className="flex items-center justify-between gap-2">
          <span className="text-sm font-semibold text-gray-800">{c.chainName}</span>
          {c.trigger && (
            <span className="shrink-0 rounded bg-gray-100 px-1.5 py-0.5 text-[11px] text-gray-500">
              今日有触发
            </span>
          )}
        </div>
        {c.humanSummary ? (
          <p className="mt-1.5 line-clamp-2 text-xs leading-relaxed text-gray-600">{c.humanSummary}</p>
        ) : (
          <p className="mt-1.5 text-xs leading-relaxed text-gray-400">今日判断生成中,先看传导结构 →</p>
        )}
        <div className="mt-2">
          <TierChips c={c} />
        </div>
      </Link>
    </div>
  );
}
