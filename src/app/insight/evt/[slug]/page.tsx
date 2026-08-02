import Link from "next/link";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { SiteHeader } from "@/components/SiteHeader";
import { getChain } from "@/data/chains";
import { getPublishedEventBySlug, listPublishedEvents } from "@/lib/insight-pipeline/docs";
import { DISCLAIMER } from "@/lib/constants";
import { safeJsonLd } from "@/lib/site";
import { EvidencePanel } from "@/components/EvidencePanel";
import { AskButton, InsightChatPanel } from "@/components/InsightChat";
import { ProIntentNudge } from "@/components/ProIntentNudge";
import { dailyRefsFor } from "@/lib/evidence";

// 事件专篇页(M2,PRD prd-2.3-iteration-review §2):事件级 ReasoningChain 的主展示页。
// 只渲染 published(全审轨:人审发布前本页 404,不硬造);发布后内容不可变 → 长 revalidate。
// SEO 一等公民(P2-4 并入):标题模板/JSON-LD Article/canonical/链页-个股页内链。
export const revalidate = 3600;

const CONF_CLS: Record<string, string> = {
  高: "bg-sky-100 text-sky-700",
  中: "bg-amber-50 text-amber-700",
  低: "bg-gray-100 text-gray-500",
};

// AI 生成 description 的免责模板(与 daily 归档页同口径:Google 摘要展示处必挂免责)
const aiDescription = (judgment: string) =>
  `${judgment.slice(0, 110)}(研究框架梳理·非确认,不构成投资建议)`;

export async function generateMetadata({
  params,
}: {
  params: { slug: string };
}): Promise<Metadata> {
  const doc = await getPublishedEventBySlug(params.slug).catch(() => null);
  if (!doc?.payload.eventMeta) return {};
  const em = doc.payload.eventMeta;
  const evtName = em.triggerName ?? getChain(doc.chainId)?.name ?? "全球事件";
  return {
    // PRD §2.3 SEO 标题模板:事件长尾 query 的免费流量位
    title: `${evtName} 会影响 A 股哪些产业链?传导路径与映射解读 | StockTell`,
    description: aiDescription(doc.payload.judgment),
    alternates: { canonical: `/insight/evt/${params.slug}` },
  };
}

export default async function EventInsightPage({ params }: { params: { slug: string } }) {
  const doc = await getPublishedEventBySlug(params.slug).catch(() => null);
  if (!doc?.payload.eventMeta) notFound();
  const p = doc.payload;
  const em = p.eventMeta!;
  const chain = getChain(doc.chainId);
  const chainName = chain?.name ?? doc.chainId;
  const askOn = process.env.INSIGHT_CHAT_ENABLED === "1";
  // 同链其它事件专篇(归档互链,SEO 抓取路径)
  const siblings = (await listPublishedEvents({ chainId: doc.chainId, limit: 6 }).catch(() => []))
    .filter((d) => d.slug !== doc.slug)
    .slice(0, 4);

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "Article",
    headline: em.title,
    datePublished: doc.date,
    inLanguage: "zh-CN",
    author: { "@type": "Organization", name: "StockTell" },
    description: aiDescription(p.judgment),
  };

  return (
    <div className="min-h-screen bg-canvas text-ink">
      <SiteHeader active="今日推理" />
      {/* LLM 内容进 JSON-LD 必须 safeJsonLd 转义(防 </script> 逃逸,与归档页同口径) */}
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: safeJsonLd(jsonLd) }} />
      <main className="mx-auto max-w-3xl px-4 py-6 sm:px-6">
        <header className="mb-4">
          <p className="text-xs text-gray-400">
            {chain?.insightSlug ? (
              <Link href={`/insight/${chain.insightSlug}`} className="text-brand-600 hover:underline">
                {chainName}
              </Link>
            ) : (
              chainName
            )}{" "}
            · 事件专篇 · {doc.date}
          </p>
          <h1 className="mt-1 text-h1 font-semibold tracking-tight">{em.title}</h1>
          <div className="mt-1.5 flex items-center gap-2 text-xs text-gray-400">
            <span className={`rounded px-1.5 py-0.5 text-[11px] font-medium ${CONF_CLS[p.confidence] ?? CONF_CLS["低"]}`}>
              置信度 {p.confidence}
            </span>
            <span>反映 {doc.date} 当日判断,不随后市更新</span>
          </div>
        </header>

        {/* 第一层·人话结论(表达三层:结论先行,术语不上首屏) */}
        <section className="mb-3 rounded-2xl bg-white p-4 shadow-sm">
          <h2 className="text-xs font-medium text-gray-500">这件事怎么看</h2>
          <p className="mt-1 text-xs leading-relaxed text-gray-500">{p.trigger.summary}</p>
          <p className="mt-2 text-sm leading-relaxed text-gray-800">{p.judgment}</p>
          <div className="mt-1.5 flex items-start justify-between gap-2">
            <EvidencePanel
              insightId={params.slug}
              date={doc.date}
              targetType="judgment"
              targetId="judgment"
              items={dailyRefsFor("judgment", p.references)}
              label={`依据 ${dailyRefsFor("judgment", p.references).length} 条`}
            />
            {askOn && <AskButton anchor={{ type: "judgment", id: "judgment", label: "事件判断" }} />}
          </div>
        </section>

        {/* 第二层·传导路径(结构化多跳:骨架为人工核定因果链,当日注解来自热力同文) */}
        {p.hops && p.hops.length > 0 && (
          <section className="mb-3 rounded-2xl bg-white p-4 shadow-sm">
            <h2 className="text-xs font-medium text-gray-500">传导路径(骨架为研究框架梳理,非当日新推)</h2>
            <ol className="mt-2 space-y-2">
              {p.hops.map((h) => (
                <li key={h.order} className="text-xs leading-relaxed text-gray-600">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="font-mono text-[11px] text-gray-300">{h.order}</span>
                    <span className="font-medium text-gray-700">
                      {h.from} → {h.to}
                    </span>
                    <span className={`rounded px-1.5 py-0.5 text-[11px] ${CONF_CLS[h.confidence] ?? CONF_CLS["低"]}`}>
                      置信 {h.confidence}
                    </span>
                    {h.todayDirection && (
                      <span className="rounded bg-gray-50 px-1.5 py-0.5 text-[11px]">
                        当日 {h.todaySegment} · {h.todayDirection}
                      </span>
                    )}
                  </div>
                  <p className="mt-0.5">{h.plain}</p>
                  {h.todayNote && <p className="mt-0.5 text-gray-400">当日:{h.todayNote}</p>}
                </li>
              ))}
            </ol>
          </section>
        )}

        <section className="mb-3 rounded-2xl bg-white p-4 shadow-sm">
          <h2 className="text-xs font-medium text-gray-500">产业链热力(当日)</h2>
          <ul className="mt-2 space-y-1.5">
            {p.heat.map((h) => (
              <li key={h.segment} className="text-xs leading-relaxed text-gray-600">
                <span className="font-medium text-gray-700">{h.segment}</span>
                <span className="mx-1 rounded bg-gray-50 px-1.5 py-0.5 text-[11px]">{h.direction}</span>
                {h.reason}
              </li>
            ))}
          </ul>
        </section>

        {p.mappingsDelta.length > 0 && (
          <section className="mb-3 rounded-2xl bg-white p-4 shadow-sm">
            <h2 className="text-xs font-medium text-gray-500">A 股映射观察(关系分级,非推荐)</h2>
            <ul className="mt-2 space-y-2.5">
              {p.mappingsDelta.map((m) => (
                <li key={m.code} className="text-xs leading-relaxed text-gray-600">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <Link href={`/stock/${m.code}`} className="font-medium text-gray-800 hover:text-brand-600">
                      {m.name}
                    </Link>
                    <span className="text-gray-400">{m.code}</span>
                    <span className="rounded bg-gray-50 px-1.5 py-0.5 text-[11px]">{m.segment}</span>
                    <span className="rounded bg-gray-50 px-1.5 py-0.5 text-[11px]">{m.relation}</span>
                  </div>
                  <p className="mt-0.5">{m.todayWhy}</p>
                  {m.verify.length > 0 && (
                    <p className="mt-0.5 text-gray-400">验证点:{m.verify.join(" / ")}</p>
                  )}
                </li>
              ))}
            </ul>
          </section>
        )}

        <section className="mb-3 rounded-2xl bg-white p-4 shadow-sm">
          <h2 className="text-xs font-medium text-gray-500">这个判断最可能错在哪</h2>
          <p className="mt-1 text-xs leading-relaxed text-gray-600">{p.risk}</p>
          <div className="mt-1.5 flex items-start justify-between gap-2">
            <EvidencePanel
              insightId={params.slug}
              date={doc.date}
              targetType="risk"
              targetId="risk"
              items={dailyRefsFor("risk", p.references)}
            />
            {askOn && <AskButton anchor={{ type: "risk", id: "risk", label: "风险/证伪条件" }} />}
          </div>
        </section>

        {/* 出口:链页(沉淀)+ 链级最新推理(当日全景) */}
        <nav className="mb-4 flex flex-wrap items-center gap-3 text-xs">
          {chain && (
            <Link href={`/chain/${chain.id}`} className="text-brand-600 hover:underline">
              {chainName} 产业链页 →
            </Link>
          )}
          {chain?.insightSlug && (
            <Link href={`/insight/${chain.insightSlug}`} className="text-brand-600 hover:underline">
              这条链的完整因果链 →
            </Link>
          )}
        </nav>

        {siblings.length > 0 && (
          <section className="mb-4 text-xs text-gray-500">
            <span className="text-gray-400">同链其它事件专篇:</span>
            {siblings.map((s, i) => (
              <span key={s.slug}>
                {i > 0 && " · "}
                <Link href={`/insight/evt/${s.slug}`} className="text-brand-600 hover:underline">
                  {s.payload.eventMeta?.title ?? s.date}
                </Link>
              </span>
            ))}
          </section>
        )}

        <p className="text-center text-xs leading-relaxed text-gray-400">
          关系标注为研究框架梳理·非确认;个股为关系分级的说明性示例,不构成推荐。{DISCLAIMER}
        </p>
        {askOn && <InsightChatPanel insightId={params.slug} date={doc.date} chainTitle={em.title} />}
        <ProIntentNudge />
      </main>
    </div>
  );
}
