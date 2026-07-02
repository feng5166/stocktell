import Link from "next/link";
import { notFound } from "next/navigation";
import { SiteHeader } from "@/components/SiteHeader";
import { FeedbackLink } from "@/components/FeedbackLink";
import { STOCK_MAP } from "@/data/stocks";
import {
  INSIGHT_CHAINS,
  type InsightChain,
  type Hop,
  type HeatDir,
  type HeatRow,
  type StockMap,
  type Relation,
  type Confidence,
} from "@/data/insight-chains";

// 推理链详情页(内核最小可证 · Beta)。静态预生成,不进导航/首页。
// 信息层级(默认更短、展开更深):10秒(首屏卡)→ 1分钟(简单说+热力色块+票名单)→ 深挖(依据/references/方法)。
export const dynamic = "force-static";
export function generateStaticParams() {
  return Object.keys(INSIGHT_CHAINS).map((slug) => ({ slug }));
}

// 方向 pill(与热力色块同一色系:红=热、绿=冷、灰=分化)
const HEAT: Record<HeatDir, string> = {
  升温: "bg-rose-50 text-rose-700",
  降温: "bg-emerald-50 text-emerald-700",
  分化: "bg-slate-200 text-slate-600",
  中性: "bg-gray-100 text-gray-500",
};
const REL: Record<Relation, string> = {
  直接: "bg-rose-100 text-rose-700",
  间接: "bg-amber-100 text-amber-700",
  情绪映射: "bg-slate-100 text-slate-500",
  弱: "bg-gray-200 text-gray-500",
};
const CONF: Record<Confidence, string> = {
  高: "bg-sky-100 text-sky-700",
  中: "bg-amber-50 text-amber-700",
  低: "bg-gray-100 text-gray-500",
  假设: "bg-rose-50 text-rose-600",
};
const REL_GROUPS: { rel: Relation; label: string; hint: string }[] = [
  { rel: "直接", label: "🟥 直接相关", hint: "和这次事件、这些环节的关系最直接(比如给北美云厂供货)" },
  { rel: "间接", label: "🟨 间接相关", hint: "受益链条存在,但中间隔了几环,要看具体订单/客户/收入占比" },
  { rel: "情绪映射", label: "⬜ 沾热度(情绪映射)", hint: "可能被热度带动,但不等于这次事件的直接受益方,真金白银看订单" },
  { rel: "弱", label: "弱关联", hint: "" },
];

// 热力色块:颜色深浅=与本次事件的关联强弱(A股心智:红=热、绿=冷;非涨幅)
function heatTile(r: HeatRow): { bg: string; fg: string; sub: string; glyph: string } {
  if (r.direction === "升温") {
    if (r.intensity >= 5) return { bg: "bg-rose-500", fg: "text-white", sub: "text-rose-100", glyph: "▲▲▲" };
    if (r.intensity === 4) return { bg: "bg-rose-400", fg: "text-white", sub: "text-rose-100", glyph: "▲▲" };
    if (r.intensity === 3) return { bg: "bg-rose-200", fg: "text-rose-900", sub: "text-rose-700", glyph: "▲" };
    return { bg: "bg-rose-100", fg: "text-rose-800", sub: "text-rose-600", glyph: "▲" };
  }
  if (r.direction === "降温") return { bg: "bg-emerald-100", fg: "text-emerald-900", sub: "text-emerald-700", glyph: "▼" };
  if (r.direction === "分化") return { bg: "bg-slate-200", fg: "text-slate-800", sub: "text-slate-600", glyph: "◐" };
  return { bg: "bg-gray-100", fg: "text-gray-700", sub: "text-gray-500", glyph: "—" };
}

function Section({
  icon,
  title,
  children,
  sub,
  id,
}: {
  icon: string;
  title: string;
  children: React.ReactNode;
  sub?: string;
  id?: string;
}) {
  return (
    <section id={id} className="mb-3 scroll-mt-16 rounded-xl bg-white px-4 py-3.5 shadow-sm">
      <h2 className="flex items-center gap-2 text-sm font-semibold text-gray-800">
        <span>{icon}</span>
        {title}
      </h2>
      {sub && <p className="mb-2 mt-0.5 text-[11px] leading-relaxed text-gray-400">{sub}</p>}
      <div className={sub ? "" : "mt-2.5"}>{children}</div>
    </section>
  );
}

function Pill({ text, cls }: { text: string; cls: string }) {
  return <span className={`shrink-0 rounded px-1.5 py-0.5 text-[11px] ${cls}`}>{text}</span>;
}

// 主线跳:人话主线 + 反转人话 + 依据行(置信度前置)
function HopRow({ h }: { h: Hop }) {
  return (
    <li className="rounded-lg bg-gray-50 px-3 py-2.5">
      <p className="text-sm leading-relaxed text-gray-800">{h.plain}</p>
      {h.caveatPlain && (
        <p className="mt-1.5 rounded bg-rose-50/70 px-2 py-1 text-xs leading-relaxed text-rose-700">
          ⚠️ {h.caveatPlain}
        </p>
      )}
      <p className="mt-1.5 text-[11px] leading-relaxed text-gray-400">
        <span className={`mr-1 rounded px-1 py-0.5 ${CONF[h.confidence]}`}>置信 {h.confidence}</span>
        依据·{h.evidenceType}
        {h.evidenceExample ? `:${h.evidenceExample}` : ""}
      </p>
    </li>
  );
}

// 票:默认单行(名单常显),依据收进组级折叠
function MappingRow({ m }: { m: StockMap }) {
  const inPool = m.code ? !!STOCK_MAP[m.code] : false;
  const inner = (
    <>
      <span className="text-sm font-medium text-gray-800">{m.name}</span>
      {m.code && <span className="font-mono text-xs text-gray-400">{m.code}</span>}
      <span className="text-xs text-gray-400">{m.segment}</span>
      <Pill text={`置信 ${m.confidence}`} cls={CONF[m.confidence]} />
      {inPool && <span className="ml-auto text-[11px] text-brand-400">看个股 →</span>}
    </>
  );
  return (
    <li>
      {inPool && m.code ? (
        <Link
          href={`/stock/${m.code}`}
          className="-mx-2 flex min-h-[40px] flex-wrap items-center gap-x-2 gap-y-0.5 rounded-lg px-2 py-1 transition-colors hover:bg-gray-50 active:bg-gray-50"
        >
          {inner}
        </Link>
      ) : (
        <div className="flex min-h-[40px] flex-wrap items-center gap-x-2 gap-y-0.5 px-2 py-1">{inner}</div>
      )}
    </li>
  );
}

export default function InsightPage({ params }: { params: { slug: string } }) {
  const c: InsightChain | undefined = INSIGHT_CHAINS[params.slug];
  if (!c) notFound();

  return (
    <div className="min-h-screen bg-canvas text-ink">
      <SiteHeader />
      <main className="mx-auto max-w-2xl px-4 py-6 sm:px-6">
        <header className="mb-3">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-h1 font-semibold tracking-tight">{c.title}</h1>
            <span className="rounded-full bg-brand-100 px-2 py-0.5 text-[11px] font-medium text-brand-700">
              Beta
            </span>
          </div>
          <p className="mt-1 text-xs text-gray-400">
            一件全球事件,如何一路传到 A 股 · 更新 {c.updatedAt}
          </p>
        </header>

        {/* ===== 10 秒层:首屏卡(事件一行 + 钩子 + 三档 + 风险 + 看票) ===== */}
        <div className="mb-3 rounded-2xl bg-brand-50/40 px-4 py-4 shadow-sm">
          <p className="text-[11px] leading-relaxed text-gray-500">
            <span className="mr-1 rounded bg-white/80 px-1 py-0.5 text-gray-500">🧪 演示事件</span>
            {c.eventPlain}
          </p>
          <p className="mt-2 text-[15px] font-medium leading-relaxed text-gray-900">{c.tldr.hook}</p>
          <div className="mt-3 space-y-2.5">
            {c.tldr.tiers.map((t) => {
              const inner = (
                <>
                  <span className="mt-0.5 shrink-0 text-lg leading-none">{t.emoji}</span>
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                      <span
                        className={`shrink-0 rounded px-1.5 py-0.5 text-[11px] font-medium ${
                          t.rel ? REL[t.rel] : "bg-gray-100 text-gray-500"
                        }`}
                      >
                        {t.level}
                      </span>
                      <span className="text-sm font-semibold text-gray-900">{t.what}</span>
                    </div>
                    <p className="mt-0.5 text-xs leading-relaxed text-gray-500">{t.why}</p>
                  </div>
                </>
              );
              return t.rel ? (
                <a key={t.level} href={`#rel-${t.rel}`} className="flex items-start gap-2.5">
                  {inner}
                </a>
              ) : (
                <div key={t.level} className="flex items-start gap-2.5">
                  {inner}
                </div>
              );
            })}
          </div>
          <p className="mt-3 rounded-lg bg-rose-50/70 px-3 py-2 text-xs leading-relaxed text-rose-800">
            <span className="font-medium text-rose-600">⚠️ 一句话风险:</span>
            {c.tldr.risk}
          </p>
          <a href="#mappings" className="mt-2.5 block text-center text-sm font-medium text-brand-600">
            👉 直接看国内相关的票({c.mappings.length} 只,按关系分级)
          </a>
        </div>

        {/* ===== 1 分钟层 ===== */}
        {/* 简单说(人话故事)+ 主线依据折叠(展开更深) */}
        <Section icon="🧭" title="简单说:这事怎么传到股票的">
          <div className="space-y-1">
            {c.storyPlain.map((line, i) => (
              <p key={i} className="text-sm leading-relaxed text-gray-800">
                {line}
              </p>
            ))}
          </div>
          <p className="mt-2 text-[11px] leading-relaxed text-gray-400">{c.storyPro}</p>
          <details className="mt-2">
            <summary className="cursor-pointer text-xs text-gray-500">
              主线两步的依据(证据 · 置信度 · 什么情况会反转)
            </summary>
            <ul className="mt-2 space-y-1.5">
              {c.mainHops.map((h) => (
                <HopRow key={h.order} h={h} />
              ))}
            </ul>
            <p className="mt-1.5 text-[11px] leading-relaxed text-gray-400">{c.hopsNote}</p>
          </details>
        </Section>

        {/* 热力色块(一眼)+ 逐环节深挖折叠 */}
        <Section icon="🔥" title="产业链热力(哪段在升温)" sub={c.heatmapNote}>
          <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-3">
            {c.heatmap.map((r, i) => {
              const t = heatTile(r);
              return (
                <div key={i} className={`rounded-lg px-2.5 py-2 ${t.bg}`}>
                  <p className={`text-[13px] font-medium leading-snug ${t.fg}`}>{r.segment}</p>
                  <p className={`mt-0.5 text-[11px] ${t.sub}`}>
                    {t.glyph} {r.direction}
                    {r.relation ? ` · ${r.relation}` : ""}
                  </p>
                </div>
              );
            })}
          </div>
          <p className="mt-1.5 text-[11px] leading-relaxed text-gray-400">
            颜色越深 = 和这次事件的关联越强、证据越足(不是涨幅)。
          </p>
          <details className="mt-2">
            <summary className="cursor-pointer text-xs text-gray-500">
              逐个环节细看(这是啥 · 怎么传到这的 · 依据)
            </summary>
            <div className="mt-2 space-y-2">
              {c.heatmap.map((r, i) => {
                const hop = r.hopOrder ? c.branchHops.find((h) => h.order === r.hopOrder) : undefined;
                return (
                  <div key={i} className="rounded-lg bg-gray-50 px-3 py-2">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="text-sm font-medium text-gray-800">{r.segment}</span>
                      <Pill text={r.direction} cls={HEAT[r.direction]} />
                      {r.relation && <Pill text={r.relation} cls={REL[r.relation]} />}
                      {r.confidence && <Pill text={`置信 ${r.confidence}`} cls={CONF[r.confidence]} />}
                    </div>
                    <p className="mt-1 text-xs leading-relaxed text-gray-600">
                      <span className="text-gray-500">这是啥:</span>
                      {r.plain}
                    </p>
                    {hop && <p className="mt-1 text-xs leading-relaxed text-gray-600">{hop.plain}</p>}
                    {hop?.caveatPlain && (
                      <p className="mt-1 rounded bg-rose-50/70 px-2 py-1 text-[11px] leading-relaxed text-rose-700">
                        ⚠️ {hop.caveatPlain}
                      </p>
                    )}
                    <p className="mt-1 text-[11px] leading-relaxed text-gray-400">{r.reason}</p>
                    {hop && (
                      <p className="mt-0.5 text-[11px] leading-relaxed text-gray-400">
                        依据·{hop.evidenceType}
                        {hop.evidenceExample ? `:${hop.evidenceExample}` : ""}
                      </p>
                    )}
                  </div>
                );
              })}
            </div>
          </details>
        </Section>

        {/* 票:名单常显(单行),依据收进组级折叠 */}
        <Section id="mappings" icon="🔗" title="国内相关的票(按关系分级,不是推荐)" sub={c.mappingNote}>
          <div className="space-y-3">
            {REL_GROUPS.map((g) => {
              const items = c.mappings.filter((m) => m.relation === g.rel);
              if (items.length === 0) return null;
              return (
                <div key={g.rel} id={`rel-${g.rel}`} className="scroll-mt-16">
                  <p className="text-xs font-semibold text-gray-700">{g.label}</p>
                  {g.hint && (
                    <p className="mb-0.5 text-[11px] leading-relaxed text-gray-400">{g.hint}</p>
                  )}
                  <ul>
                    {items.map((m) => (
                      <MappingRow key={m.name} m={m} />
                    ))}
                  </ul>
                  <details>
                    <summary className="cursor-pointer text-[11px] text-gray-400">
                      为什么是这几只 · 关系依据
                    </summary>
                    <ul className="mt-1 space-y-1">
                      {items.map((m) => (
                        <li key={m.name} className="text-xs leading-relaxed text-gray-500">
                          <b className="text-gray-600">{m.name}</b>:{m.reason}
                        </li>
                      ))}
                    </ul>
                  </details>
                </div>
              );
            })}
          </div>
        </Section>

        {/* ===== 深挖层:提醒 + references + 完整判断/方法 ===== */}
        <Section icon="🔍" title="深挖核验(给想较真的你)">
          <ul className="space-y-1 text-xs leading-relaxed text-gray-600">
            {c.uncertainties.map((u, i) => (
              <li key={i}>· {u}</li>
            ))}
          </ul>
          <details className="mt-2.5">
            <summary className="cursor-pointer text-xs text-gray-500">📚 去哪核实(references)</summary>
            <ul className="mt-2 space-y-2">
              {c.references.map((ref) => (
                <li key={ref.name} className="text-xs leading-relaxed">
                  <a
                    href={ref.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="font-medium text-brand-600 hover:underline"
                  >
                    {ref.name} ↗
                  </a>
                  <span className="ml-1.5 rounded bg-gray-100 px-1 py-0.5 text-[11px] text-gray-500">
                    {ref.type}
                  </span>
                  <span className="block text-gray-500">{ref.note}</span>
                </li>
              ))}
            </ul>
            <p className="mt-2 text-[11px] leading-relaxed text-gray-400">
              演示阶段给的是常设官方入口(真实可点);正式上线,每一步还会挂当天的具体来源与时间戳。
            </p>
          </details>
          <details className="mt-1.5 text-xs text-gray-500">
            <summary className="cursor-pointer text-gray-500">完整判断 · 凭什么不是「新闻聚合」· 方法</summary>
            <div className="mt-1.5 space-y-1.5 leading-relaxed">
              <p className="text-gray-600">
                <b className="text-gray-700">完整判断(人话):</b>
                {c.oneLinerPlain}
              </p>
              <p className="text-gray-600">
                <b className="text-gray-700">专业口径:</b>
                {c.oneLiner}
              </p>
              <p className="text-gray-600">
                <b className="text-gray-700">事件专业表述:</b>
                {c.event}
              </p>
              <p className="pt-1 font-medium text-gray-600">凭什么不是新闻聚合:</p>
              {c.differentiators.map((d, i) => (
                <p key={i}>· {d}</p>
              ))}
              <p className="text-gray-400">{c.whyThisEvent}</p>
            </div>
          </details>
        </Section>

        {/* ===== CTA:真按钮,不做交易导向 ===== */}
        <div className="mb-3 rounded-xl bg-white px-4 py-3.5 shadow-sm">
          <p className="text-sm font-semibold text-gray-800">接下来</p>
          <div className="mt-2.5 flex flex-wrap gap-2">
            <a
              href="#mappings"
              className="inline-flex min-h-[40px] items-center gap-1 rounded-lg bg-brand-600 px-3.5 py-2 text-sm font-medium text-white transition-colors hover:bg-brand-700"
            >
              ⭐ 挑几只加进自选盯起来
            </a>
            <Link
              href="/settings"
              className="inline-flex min-h-[40px] items-center gap-1 rounded-lg bg-gray-100 px-3.5 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-200"
            >
              📬 订阅每日提醒
            </Link>
            <Link
              href="/"
              className="inline-flex min-h-[40px] items-center gap-1 rounded-lg bg-gray-100 px-3.5 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-200"
            >
              📰 看今日简报
            </Link>
          </div>
          <p className="mt-2 text-[11px] leading-relaxed text-gray-400">
            不喊单:这些动作只是帮你持续跟着这条链。想要「订阅这条链」的更新?
            <span className="ml-1 inline-flex align-middle">
              <FeedbackLink />
            </span>
          </p>
        </div>

        <p className="mb-2 text-meta leading-relaxed text-gray-400">🧪 {c.eventNote}</p>
        <p className="text-meta leading-relaxed text-gray-400">{c.disclaimer}</p>
      </main>
    </div>
  );
}
