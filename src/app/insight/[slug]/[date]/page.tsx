import Link from "next/link";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { SiteHeader } from "@/components/SiteHeader";
import { CHAINS } from "@/data/chains";
import { INSIGHT_CHAINS } from "@/data/insight-chains";
import { getPublishedDaily, listPublishedDailyDates } from "@/lib/insight-pipeline/docs";
import { DISCLAIMER } from "@/lib/constants";
import { safeJsonLd } from "@/lib/site";
import { EvidencePanel } from "@/components/EvidencePanel";
import { AskButton, InsightChatPanel } from "@/components/InsightChat";
import { dailyRefsFor } from "@/lib/evidence";

// 每日 insight 归档页(2.1-W4):把每天的链级推理沉淀成可被搜索引擎抓取的内容资产。
// 只渲染 published(fallback 引擎产出的 doc 也是人审后 published,不伪装口径由置信度徽章表达);
// 内容一经归档即不可变 → 长 revalidate。无该日 doc → 404(不硬造)。
export const revalidate = 3600;

const slugToChainId = (slug: string): string | null =>
  Object.values(CHAINS).find((c) => c.insightSlug === slug)?.id ?? null;

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

// AI 生成 description 的统一免责模板(metadata 与 JSON-LD 共用,防两份漂移)
const aiDescription = (judgment: string) =>
  `${judgment.slice(0, 110)}(研究框架梳理·非确认,不构成投资建议)`;

export async function generateMetadata({
  params,
}: {
  params: { slug: string; date: string };
}): Promise<Metadata> {
  const c = INSIGHT_CHAINS[params.slug];
  const chainId = slugToChainId(params.slug);
  if (!c || !chainId || !DATE_RE.test(params.date)) return {};
  const doc = await getPublishedDaily(chainId, params.date).catch(() => null);
  if (!doc) return {};
  const chainName = c.title.replace(" · 因果链", "");
  return {
    title: `${params.date} ${chainName}产业链每日推理 | StockTell`,
    // 三轮 review T7:AI 生成的 description 必须挂免责(合规口径:AI 输出挂"不构成投资建议";
    // Google 摘要展示的是这里而非页内 DISCLAIMER),截断后缀在免责前,半句不裸奔
    description: aiDescription(doc.payload.judgment),
    alternates: { canonical: `/insight/${params.slug}/${params.date}` },
  };
}

const CONF_CLS: Record<string, string> = {
  高: "bg-sky-100 text-sky-700",
  中: "bg-amber-50 text-amber-700",
  低: "bg-gray-100 text-gray-500",
};

export default async function InsightArchivePage({
  params,
}: {
  params: { slug: string; date: string };
}) {
  const c = INSIGHT_CHAINS[params.slug];
  const chainId = slugToChainId(params.slug);
  if (!c || !chainId || !DATE_RE.test(params.date)) notFound();
  const doc = await getPublishedDaily(chainId, params.date).catch(() => null);
  if (!doc) notFound();
  const p = doc.payload;
  const chainName = c.title.replace(" · 因果链", "");
  // 情境追问总开关(PR4):env 关 = 不渲染任何入口与面板(PRD §5.6)
  const askOn = process.env.INSIGHT_CHAT_ENABLED === "1";
  // 前后日导航(归档互链,SEO 抓取路径)
  const dates = await listPublishedDailyDates(chainId, 120).catch(() => [] as string[]);
  const idx = dates.indexOf(params.date);
  const newer = idx > 0 ? dates[idx - 1] : null;
  const older = idx >= 0 && idx < dates.length - 1 ? dates[idx + 1] : null;

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "Article",
    headline: `${params.date} ${chainName}产业链每日推理`,
    datePublished: params.date,
    inLanguage: "zh-CN",
    author: { "@type": "Organization", name: "StockTell" },
    description: aiDescription(p.judgment),
  };

  return (
    <div className="min-h-screen bg-canvas text-ink">
      <SiteHeader active="今日推理" />
      {/* 三轮 review T1:LLM 内容进 JSON-LD 必须 safeJsonLd 转义 '<'(防 </script> 逃逸=存储型 XSS) */}
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: safeJsonLd(jsonLd) }} />
      <main className="mx-auto max-w-3xl px-4 py-6 sm:px-6">
        <header className="mb-4">
          <p className="text-xs text-gray-400">
            <Link href={`/insight/${params.slug}`} className="text-brand-600 hover:underline">
              {chainName}产业链
            </Link>{" "}
            · 每日推理归档
          </p>
          <h1 className="mt-1 text-h1 font-semibold tracking-tight">
            {params.date} · {chainName}链级推理
          </h1>
          <div className="mt-1.5 flex items-center gap-2 text-xs text-gray-400">
            <span className={`rounded px-1.5 py-0.5 text-[11px] font-medium ${CONF_CLS[p.confidence] ?? CONF_CLS["低"]}`}>
              置信度 {p.confidence}
            </span>
            <span>历史归档,反映当日判断,不随后市更新</span>
          </div>
        </header>

        <section className="mb-3 rounded-2xl bg-white p-4 shadow-sm">
          <h2 className="text-xs font-medium text-gray-500">事件与判断</h2>
          <p className="mt-1 text-xs leading-relaxed text-gray-500">{p.trigger.summary}</p>
          <p className="mt-2 text-sm leading-relaxed text-gray-800">{p.judgment}</p>
          {/* PR1:当日依据就近可见(此前只在页底);PR3:v2 按 targets 选取,v1 归档兼容=全量 */}
          <div className="mt-1.5 flex items-start justify-between gap-2">
            <EvidencePanel
              insightId={params.slug}
              date={params.date}
              targetType="judgment"
              targetId="judgment"
              items={dailyRefsFor("judgment", p.references)}
              label={`今日依据 ${dailyRefsFor("judgment", p.references).length} 条`}
            />
            {askOn && <AskButton anchor={{ type: "judgment", id: "judgment", label: "当日判断" }} />}
          </div>
        </section>

        <section className="mb-3 rounded-2xl bg-white p-4 shadow-sm">
          <h2 className="text-xs font-medium text-gray-500">当日产业链热力</h2>
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
            <h2 className="text-xs font-medium text-gray-500">当日映射观察(关系分级,非推荐)</h2>
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
          <h2 className="text-xs font-medium text-gray-500">当日风险</h2>
          <p className="mt-1 text-xs leading-relaxed text-gray-600">{p.risk}</p>
          <div className="mt-1.5 flex items-start justify-between gap-2">
            <EvidencePanel
              insightId={params.slug}
              date={params.date}
              targetType="risk"
              targetId="risk"
              items={dailyRefsFor("risk", p.references)}
            />
            {askOn && <AskButton anchor={{ type: "risk", id: "risk", label: "当日风险/证伪条件" }} />}
          </div>
        </section>

        <nav className="mb-4 flex items-center justify-between text-xs">
          {older ? (
            <Link href={`/insight/${params.slug}/${older}`} className="text-brand-600 hover:underline">
              ← {older}
            </Link>
          ) : (
            <span />
          )}
          <Link href={`/insight/${params.slug}`} className="text-gray-400 hover:text-gray-600">
            查看最新
          </Link>
          {newer ? (
            <Link href={`/insight/${params.slug}/${newer}`} className="text-brand-600 hover:underline">
              {newer} →
            </Link>
          ) : (
            <span />
          )}
        </nav>

        <p className="text-center text-xs leading-relaxed text-gray-400">
          关系标注为研究框架梳理·非确认;历史归档不代表未来表现。{DISCLAIMER}
        </p>
        {askOn && (
          <InsightChatPanel insightId={params.slug} date={params.date} chainTitle={chainName} />
        )}
      </main>
    </div>
  );
}
