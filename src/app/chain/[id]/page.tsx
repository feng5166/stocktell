import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { SiteHeader } from "@/components/SiteHeader";
import { ChainSentiment } from "@/components/ChainSentiment";
import { OvernightRadar } from "@/components/OvernightRadar";
import { ChainRoster } from "@/components/chain/ChainRoster";
import { ChainConvert, type ShareSummary } from "@/components/chain/ChainConvert";
import { chainSentiment } from "@/lib/sentiment";
import { listBriefing, latestBriefing, type BriefingItem } from "@/lib/briefings";
import { todayISO } from "@/lib/date";
import { getChain, rosterOf } from "@/data/chains";
import { DISCLAIMER } from "@/lib/constants";

export const revalidate = 60;

const pct1 = (v: number) => `${v > 0 ? "+" : ""}${v.toFixed(1)}%`;
const pct2 = (v: number) => `${v > 0 ? "+" : ""}${v.toFixed(2)}%`;

export function generateMetadata({ params }: { params: { id: string } }): Metadata {
  const chain = getChain(params.id);
  if (!chain) return {};
  return {
    title: `${chain.name} · 今日解读 · StockTell`,
    description: chain.tagline,
    openGraph: { title: `${chain.name} · 今日解读`, description: chain.tagline },
  };
}

export default async function ChainPage({
  params,
  searchParams,
}: {
  params: { id: string };
  searchParams: { ref?: string | string[] };
}) {
  const chain = getChain(params.id);
  if (!chain) notFound();
  const refCode =
    typeof searchParams?.ref === "string" ? searchParams.ref : null;

  const date = todayISO();
  const [sentiment, todayItems] = await Promise.all([
    chainSentiment().catch(() => ({ date: null, a: null, us: null })),
    listBriefing({ date, status: "published" }).catch(() => [] as BriefingItem[]),
  ]);

  let items = todayItems;
  let shownDate = date;
  let stale = false;
  if (!items || items.length === 0) {
    const latest = await latestBriefing().catch(() => ({ date: null, items: [] }));
    items = latest.items;
    shownDate = latest.date ?? date;
    stale = true;
  }
  const topItems = items.slice(0, 3);

  // 分享卡摘要(服务端算好)
  const a = sentiment.a;
  const us = sentiment.us;
  const summary: ShareSummary = {
    date: shownDate,
    moodLine: a
      ? `A股 涨${a.up} 跌${a.down} · 均 ${pct2(a.avgPct)}`
      : "A股 情绪数据生成中",
    overnight:
      us?.indices && us.indices.length
        ? "隔夜 " + us.indices.map((i) => `${i.name} ${pct1(i.change)}`).join(" · ")
        : "隔夜美股 数据生成中",
    topTitle: topItems[0]?.title ?? null,
  };

  const roster = rosterOf(chain);

  return (
    <div className="min-h-screen bg-canvas text-ink">
      <SiteHeader />
      <main className="mx-auto max-w-3xl px-4 py-6 pb-[calc(4.5rem+env(safe-area-inset-bottom))] sm:px-6">
        {/* Hero */}
        <div>
          <div className="text-xs font-medium text-brand-600">产业链解读</div>
          <h1 className="mt-0.5 text-display font-semibold tracking-tight text-gray-900">
            {chain.name}
          </h1>
          <p className="mt-1 text-sm text-gray-500">{chain.tagline}</p>
        </div>

        {/* 今日情绪 */}
        <div className="mt-4">
          <ChainSentiment initial={sentiment} />
        </div>

        {/* 隔夜美股 · A股联动 */}
        <div className="mt-4">
          <OvernightRadar />
        </div>

        {/* 今日关键动态 */}
        {topItems.length > 0 && (
          <section className="mt-6">
            <div className="flex items-baseline justify-between">
              <h2 className="text-h2 font-semibold text-gray-900">今日关键动态</h2>
              {stale && (
                <span className="text-xs text-gray-400">最近一期 · {shownDate}</span>
              )}
            </div>
            <div className="mt-3 space-y-2">
              {topItems.map((it) => (
                <div
                  key={it.id}
                  className="rounded-xl border border-gray-200 bg-white px-4 py-3"
                >
                  <div className="flex items-center gap-2">
                    <span className="rounded bg-gray-100 px-1.5 py-0.5 text-[11px] font-medium text-gray-500">
                      {it.impact}影响
                    </span>
                    <span className="font-medium text-gray-900">{it.title}</span>
                  </div>
                  {it.beneficiaries.length > 0 && (
                    <div className="mt-1 text-xs text-gray-500">
                      涉及:{it.beneficiaries.map((b) => b.name).join("、")}
                    </div>
                  )}
                  {it.retailTake && (
                    <div className="mt-1 text-xs text-gray-600">怎么想:{it.retailTake}</div>
                  )}
                </div>
              ))}
            </div>
          </section>
        )}

        {/* 转化 + 分享 */}
        <ChainConvert
          chainId={chain.id}
          chainName={chain.name}
          tagline={chain.tagline}
          refCode={refCode}
          summary={summary}
        />

        {/* 成分股 + 加自选 */}
        <ChainRoster chainId={chain.id} members={roster} />

        <p className="mt-8 text-xs leading-relaxed text-gray-400">{DISCLAIMER}</p>
      </main>
    </div>
  );
}
