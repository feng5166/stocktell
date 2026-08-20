import Link from "next/link";
import { SiteHeader } from "@/components/SiteHeader";
import { CHAINS } from "@/data/chains";
import { INSIGHT_CHAINS } from "@/data/insight-chains";
import { allRelations } from "@/data/chain-relations";
import { DISCLAIMER } from "@/lib/constants";
import { chainIdFromSlug } from "@/lib/relation-rank";

// 产业链总览(2026-07-09 SEO 底座):全部产业链的入口枢纽页——
// 每条链给「是什么(人话)/成分规模/关系分级构成/两个入口(链页·深读)」。
// 零请求:全部读静态配置与关系库,ISR 长缓存。
export const revalidate = 3600;

export const metadata = {
  title: "产业链图谱总览:AI 算力、数据中心电力、半导体设备 | StockTell",
  description:
    "StockTell 覆盖的产业链图谱:每条链的传导逻辑、核心环节、A 股映射与关系分级(直接/间接/情绪/待验证)。研究框架梳理·非确认,不构成投资建议。",
  alternates: { canonical: "/chains" },
  openGraph: {
    title: "产业链图谱总览 | StockTell",
    description: "从全球事件到 A 股映射:每条产业链的传导逻辑、核心环节与关系分级。",
  },
};

export default function ChainsPage() {
  const rels = allRelations();
  const chains = Object.values(CHAINS).map((c) => {
    const relChainId = chainIdFromSlug(c.insightSlug) ?? c.id;
    const mine = rels.filter((r) => r.chainId === relChainId);
    const count = (t: string) => mine.filter((r) => r.relationType === t).length;
    const insight = c.insightSlug ? INSIGHT_CHAINS[c.insightSlug] : undefined;
    return {
      id: c.id,
      name: c.name,
      tagline: c.tagline,
      plain: insight?.oneLinerPlain ?? null,
      segments: (c.segments ?? []).map((s) => s.name).filter((n) => n !== "其他链上环节"),
      insightSlug: c.insightSlug ?? null,
      direct: count("direct"),
      indirect: count("indirect"),
      sentiment: count("sentiment"),
      candidate: count("candidate"),
      triggers: count("trigger"),
      aCount: c.aMembers.length,
    };
  });

  return (
    <div className="min-h-screen bg-canvas text-ink">
      <SiteHeader active="产业链" />

      <main className="mx-auto max-w-3xl px-4 py-8 sm:px-6">
        <h1 className="text-h1 font-semibold tracking-tight">产业链图谱总览</h1>
        <p className="mt-2 text-sm leading-relaxed text-gray-600">
          StockTell 只回答一个问题:全球事件会沿着哪条产业链传导、哪些 A
          股是直接相关、哪些只是情绪映射。下面是当前覆盖的产业链——每条都有传导结构深读与每日推理。
        </p>

        <div className="mt-6 space-y-4">
          {chains.map((c) => (
            <section key={c.id} className="rounded-xl bg-white p-5 shadow-sm">
              <h2 className="text-h2 font-semibold text-gray-900">
                <Link href={`/chain/${c.id}`} className="hover:text-brand-600">
                  {c.name}
                </Link>
              </h2>
              <p className="mt-1.5 text-sm leading-relaxed text-gray-600">{c.tagline}</p>
              {c.plain && (
                <p className="mt-2 text-xs leading-relaxed text-gray-500">{c.plain}</p>
              )}

              {c.segments.length > 0 && (
                <p className="mt-3 text-xs text-gray-500">
                  <span className="text-gray-400">核心环节:</span>
                  {c.segments.join(" / ")}
                </p>
              )}

              <div className="mt-2.5 flex flex-wrap gap-x-4 gap-y-1 text-xs tabular-nums text-gray-500">
                <span>A 股成分 <b className="text-gray-800">{c.aCount}</b></span>
                <span>海外触发源 <b className="text-gray-800">{c.triggers}</b></span>
                <span>直接映射 <b className="text-gray-800">{c.direct}</b></span>
                <span>间接映射 <b className="text-gray-800">{c.indirect}</b></span>
                {c.sentiment > 0 && <span>情绪映射 <b className="text-gray-800">{c.sentiment}</b></span>}
                {c.candidate > 0 && <span>待验证 <b className="text-gray-800">{c.candidate}</b></span>}
              </div>

              <div className="mt-3 flex flex-wrap gap-3 text-xs font-medium">
                <Link href={`/chain/${c.id}`} className="text-brand-600 hover:underline">
                  链页与今日状态 →
                </Link>
                {c.insightSlug && (
                  <Link href={`/insight/${c.insightSlug}`} className="text-brand-600 hover:underline">
                    这条链怎么传导(深读) →
                  </Link>
                )}
              </div>
            </section>
          ))}
        </div>

        <p className="mt-6 text-xs leading-relaxed text-gray-400">
          关系分级为研究框架梳理 · 非确认;「直接 / 间接 / 情绪 / 待验证」表示传导距离与证据完整度,不代表受益确定,也不构成推荐。
          {" "}{DISCLAIMER}
        </p>
      </main>
    </div>
  );
}
