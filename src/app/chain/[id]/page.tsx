import { notFound } from "next/navigation";
import Link from "next/link";
import type { Metadata } from "next";
import { SiteHeader } from "@/components/SiteHeader";
import { ChainSentiment } from "@/components/ChainSentiment";
import { OvernightRadar } from "@/components/OvernightRadar";
import { buildRelLabelMap, resolveInChainLabel, resolveRelationLabelForItem } from "@/lib/relation-resolver";
import { ChainRoster } from "@/components/chain/ChainRoster";
import { ChainConvert, type ShareSummary } from "@/components/chain/ChainConvert";
import { sentimentSnapshot, type ChainSentiment as SentimentData } from "@/lib/sentiment";
import { listBriefing, latestBriefing, type BriefingItem } from "@/lib/briefings";
import { getChainTake, fallbackChainTake } from "@/lib/chain-take";
import { TakeBody } from "@/components/RetailTake";
import { getPublishedDaily } from "@/lib/insight-pipeline/docs";
import { todayISO } from "@/lib/date";
import { getChain, rosterOf } from "@/data/chains";
import { INSIGHT_CHAINS } from "@/data/insight-chains";
import { REL_CHIP_CLS, chainIdFromRoute } from "@/lib/relation-rank";
import { routeInsightForItem } from "@/data/trigger-sources";
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
    alternates: { canonical: `/chain/${chain.id}` },
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
  // 情绪只读缓存快照(零 fetch,不在渲染里冷算堵 TTFB);过期由客户端组件后台刷新
  const [snap, todayItems] = await Promise.all([
    sentimentSnapshot().catch(() => null),
    listBriefing({ date, status: "published" }).catch(() => [] as BriefingItem[]),
  ]);
  const sentiment: SentimentData = snap?.data ?? { date: null, a: null, us: null };

  let items = todayItems;
  let shownDate = date;
  let stale = false;
  if (!items || items.length === 0) {
    const latest = await latestBriefing().catch(() => ({ date: null, items: [] }));
    items = latest.items;
    shownDate = latest.date ?? date;
    stale = true;
  }
  // 链页事件排序:优先展示命中【本链成分】的事件(数据中心电力链页别把 AI/半导体/机器人
  // 事件当主动态)。命中本链 aMembers 的排前,其余降权;都不命中时给"暂无直接事件"提示。
  const chainCodes = new Set(chain.aMembers.map((s) => s.code));
  const hitsChain = (it: BriefingItem) =>
    (it.triggerCode != null && chainCodes.has(it.triggerCode)) ||
    it.beneficiaries.some((b) => chainCodes.has(b.code));
  const sortedItems = [...items].sort(
    (a, b) => Number(hitsChain(b)) - Number(hitsChain(a))
  );
  const directItems = sortedItems.filter(hitsChain);
  const topItems = (directItems.length > 0 ? directItems : sortedItems).slice(0, 3);
  const noDirectEvent = directItems.length === 0; // 无命中本链的直接事件

  // 链级「今日一句话判断」:优先 published daily → chain-take;非 ai 链(无专属 cron/事件)
  // 用链配置的静态口径 todayFraming,不用 AI 事件兜底的 fallbackChainTake(否则说的是 AI 链的话)。
  const daily = await getPublishedDaily(chain.id, shownDate).catch(() => null);
  const chainTake =
    daily?.payload.judgment ||
    (await getChainTake(chain.id, shownDate).catch(() => null)) ||
    chain.todayFraming ||
    fallbackChainTake(items);

  // 成分股「今天为什么被提到」:今天的简报条目里出现过的受益股 → code 到条目标题。
  // 直接复用已取到的 items,零额外请求;roster 行内渲染,让清单每天有变化。
  const mentioned: Record<string, string> = {};
  for (const it of items)
    for (const b of it.beneficiaries)
      if (!mentioned[b.code]) mentioned[b.code] = it.title;

  // 分享卡摘要(服务端算好)
  const a = sentiment.a;
  const us = sentiment.us;
  const fmtYi = (v: number) => `${v > 0 ? "+" : ""}${v.toFixed(1)}亿`;
  const summary: ShareSummary = {
    date: shownDate,
    aLine: a
      ? `A股 涨${a.up} 跌${a.down} · 均 ${pct2(a.avgPct)}` +
        (a.netMfYi != null ? ` · 主力 ${fmtYi(a.netMfYi)}` : "")
      : "A股情绪数据生成中",
    usLine:
      us?.indices && us.indices.length
        ? us.indices.map((i) => `${i.name} ${pct1(i.change)}`).join(" · ")
        : "隔夜美股数据生成中",
    items: topItems.map((it) => ({
      impact: it.impact,
      title: it.title,
      benes: it.beneficiaries.map((b) => b.name).slice(0, 5).join("、"),
    })),
  };

  // 成分股一句话:优先用 insight 核定的 reason(链专属、合规、带验证点),覆盖 AI 口径的
  // 模板 retailTake(否则电力链票会显示"跟 AI 主线情绪同步/别当压舱石"等交易语感+错链文案)。
  // 在 roster 数据里就替换掉,不把 AI take 序列化进客户端 payload。
  const insightForChain = chain.insightSlug ? INSIGHT_CHAINS[chain.insightSlug] : undefined;
  const reasonByCode = new Map(
    (insightForChain?.mappings ?? [])
      .filter((m) => m.code)
      .map((m) => [m.code as string, m.reason])
  );
  const roster = rosterOf(chain).map((r) => ({
    ...r,
    take: reasonByCode.get(r.code) ?? r.take,
  }));

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

        {/* 今日情绪(快照过期 → 先渲染旧值再后台刷新) */}
        <div className="mt-4">
          <ChainSentiment
            initial={sentiment}
            refresh={snap ? !snap.fresh : false}
            title={chain.sentimentTitle}
          />
        </div>

        {/* 链级一句话判断:为什么强/弱、传导到哪些环节、哪些只是情绪映射(评审拍板 P0-1) */}
        {chainTake && (
          <div className="mt-4 rounded-xl bg-white p-4 shadow-sm">
            <div className="mb-1 flex items-baseline justify-between gap-2">
              <span className="text-xs font-medium text-brand-600">
                今天怎么看这条链
              </span>
              {stale && (
                <span className="shrink-0 text-meta text-gray-400">
                  最近一期 · {shownDate}
                </span>
              )}
            </div>
            <p className="text-sm leading-relaxed text-gray-800">{chainTake}</p>
            {chain.insightSlug && (
              <div className="mt-2 text-right">
                <Link
                  href={`/insight/${chain.insightSlug}`}
                  className="text-xs font-medium text-brand-600 hover:underline"
                >
                  这条链是怎么传导的?看完整因果链 →
                </Link>
              </div>
            )}
          </div>
        )}

        {/* 应用侧深化 insight 入口(如「AI 应用为什么没有直接映射?」) */}
        {chain.relatedInsights?.length ? (
          <div className="mt-4 space-y-2">
            {chain.relatedInsights.map((ri) => (
              <Link
                key={ri.slug}
                href={`/insight/${ri.slug}`}
                className="flex items-center justify-between rounded-xl border border-gray-200 bg-white px-4 py-3 transition-colors hover:border-brand-200 hover:bg-brand-50/40"
              >
                <span className="text-sm font-medium text-gray-800">{ri.label}</span>
                <span className="shrink-0 text-xs font-medium text-brand-600">看拆解 →</span>
              </Link>
            ))}
          </div>
        ) : null}

        {/* 隔夜美股 · A股联动 */}
        <div className="mt-4">
          <OvernightRadar relMap={buildRelLabelMap()} />
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
            {/* 无命中本链的直接事件时明说,不硬把 AI/半导体/机器人事件当本链主动态 */}
            {noDirectEvent && (
              <p className="mt-1.5 text-xs leading-relaxed text-gray-400">
                今日暂无直接命中本链的事件,以下为相关外溢触发源(AI 基础设施 / 算力链)。
              </p>
            )}
            <div className="mt-3 space-y-2">
              {topItems.map((it) => (
                <div
                  key={it.id}
                  className="rounded-xl border border-gray-200 bg-white px-4 py-3"
                >
                  <div className="flex items-center gap-2">
                    <span
                      className={`shrink-0 rounded px-1.5 py-0.5 text-[11px] font-medium ${
                        REL_CHIP_CLS[resolveRelationLabelForItem(it)] ?? "bg-gray-100 text-gray-600"
                      }`}
                    >
                      {resolveRelationLabelForItem(it)}
                    </span>
                    <span className="font-medium text-gray-900">{it.title}</span>
                  </div>
                  {it.beneficiaries.length > 0 && (
                    <div className="mt-1 text-xs text-gray-500">
                      A 股映射:
                      {it.beneficiaries.map((b, bi) => (
                        <span key={b.code}>
                          {bi > 0 && "、"}
                          <Link
                            href={`/stock/${b.code}`}
                            className="text-brand-600 hover:underline"
                          >
                            {b.name}
                          </Link>
                        </span>
                      ))}
                    </div>
                  )}
                  {it.retailTake && (
                    <div className="mt-1 text-xs text-gray-600">
                      <div className="mb-0.5 font-medium text-gray-500">这条逻辑怎么验证</div>
                      {/* retailTake 现为四段 markdown,必须用 TakeBody 渲染,否则字面 ** 星号泄漏 */}
                      <TakeBody text={it.retailTake} />
                    </div>
                  )}
                  {/* P1.1:海外 AI 应用事件的"反误判"入口 */}
                  {(() => {
                    const ar = routeInsightForItem(it);
                    return ar ? (
                      <Link
                        href={`/insight/${ar.slug}`}
                        className="mt-1.5 flex items-center justify-between gap-2 rounded-lg bg-amber-50 px-3 py-2 hover:bg-amber-100"
                      >
                        <span className="text-xs font-medium text-amber-800">🔍 {ar.label}</span>
                        <span className="shrink-0 text-xs text-amber-500">→</span>
                      </Link>
                    ) : null;
                  })()}
                  {/* 深读出口:把分享页与 insight 因果链打通(评审拍板 P0-2) */}
                  {chain.insightSlug && (
                    <div className="mt-1.5 text-right">
                      <Link
                        href={`/insight/${chain.insightSlug}`}
                        className="text-xs font-medium text-brand-600 hover:underline"
                      >
                        看它怎么传到 A 股 →
                      </Link>
                    </div>
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

        {/* 成分股 + 加自选(mentioned=今天简报点名过的票,行内标注让清单每天有变化) */}
        <ChainRoster
          chainId={chain.id}
          members={roster}
          mentioned={mentioned}
          relations={Object.fromEntries(
            // B2-2:按【本链】核定关系(chain-scoped),不跨链取最强档把间接股越级成直接
            roster.map((r) => [
              r.code,
              // P1-1:走 relationResolver(本链 chain-scoped),不再直读旧 relation.ts;路由 id→chainId
              resolveInChainLabel(r.code, chainIdFromRoute(chain.id)) ?? "产业链相关",
            ])
          )}
          groupOverride={chain.rosterGroups?.groupOverride}
          sectorLabels={chain.rosterGroups?.sectorLabels}
          groupNotes={chain.rosterGroups?.groupNotes}
          bottomSectors={chain.rosterGroups?.bottomSectors}
        />

        <p className="mt-8 text-xs leading-relaxed text-gray-400">{DISCLAIMER}</p>
      </main>
    </div>
  );
}
