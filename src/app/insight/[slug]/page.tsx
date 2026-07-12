import Link from "next/link";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { SiteHeader } from "@/components/SiteHeader";
import { STOCK_MAP } from "@/data/stocks";
import { CHAINS } from "@/data/chains";
import { REL_CHIP_CLS_SHORT, EVIDENCE_LABEL, chainIdFromSlug } from "@/lib/relation-rank";
import { getPublishedDaily } from "@/lib/insight-pipeline/docs";
import { todayISO } from "@/lib/date";
import { resolveInChain } from "@/lib/relation-resolver";
import { EvidencePanel } from "@/components/EvidencePanel";
import {
  fromInsightRef,
  fromRelationRef,
  matchReferences,
  dailyRefsFor,
  type EvidenceItem,
} from "@/lib/evidence";
import {
  INSIGHT_CHAINS,
  type InsightChain,
  type Hop,
  type HeatRow,
  type StockMap,
  type Relation,
  type Confidence,
} from "@/data/insight-chains";

// 推理链详情页(内核最小可证 · Beta)。静态预生成,不进导航/首页。
// 层级(默认人话、展开专业):10秒卡 → 真正关键就两步 → 热力(人话层常显/专业层折叠)→ 票名单 → 易看错 → CTA。
// SSG + ISR:骨架静态,顶部「今日更新」区读当日 published daily(60s 重算)。
// 无 daily / 未审时不渲染该区,正文骨架照常(地板保证)。
export const revalidate = 60;
export function generateStaticParams() {
  return Object.keys(INSIGHT_CHAINS).map((slug) => ({ slug }));
}

// SEO(2.1-W4):三条核心链页是自然流量主入口,title 直答搜索意图(产业链是什么/怎么传导/
// A 股映射),description 用人话结论;禁荐股口径(内容本身已过合规,这里只描述不判断)。
export function generateMetadata({ params }: { params: { slug: string } }): Metadata {
  const c = INSIGHT_CHAINS[params.slug];
  if (!c) return {};
  return {
    title: `${c.title.replace(" · 因果链", "")}产业链:事件如何传导到 A 股映射 | StockTell`,
    description: c.oneLinerPlain.slice(0, 150),
    alternates: { canonical: `/insight/${params.slug}` },
    openGraph: {
      title: c.title,
      description: c.oneLinerPlain.slice(0, 150),
      type: "article",
    },
  };
}

const CONF: Record<Confidence, string> = {
  高: "bg-sky-100 text-sky-700",
  中: "bg-amber-50 text-amber-700",
  低: "bg-gray-100 text-gray-500",
  假设: "bg-rose-50 text-rose-600",
};
const REL_GROUPS: { rel: Relation; label: string; hint: string }[] = [
  { rel: "直接", label: "🟥 直接映射", hint: "和这次事件、这些环节的关系最直接(比如给北美云厂供货)" },
  { rel: "间接", label: "🟨 间接映射", hint: "受益链条存在,但中间隔了几环,要看具体订单/客户/收入占比" },
  { rel: "情绪映射", label: "⬜ 情绪映射(沾热度)", hint: "可能被热度带动,但不等于这次事件的直接受益方,真金白银看订单" },
];

// 热力行底色:颜色深浅=与本次事件的关联强弱(A股心智:红=热、绿=冷;非涨幅)
function rowTint(r: HeatRow): { bg: string; glyph: string; cls: string } {
  if (r.direction === "升温") {
    if (r.intensity >= 5) return { bg: "bg-rose-200", glyph: "▲▲▲", cls: "text-rose-700" };
    if (r.intensity === 4) return { bg: "bg-rose-100", glyph: "▲▲", cls: "text-rose-700" };
    return { bg: "bg-rose-50", glyph: "▲", cls: "text-rose-600" };
  }
  if (r.direction === "降温") return { bg: "bg-emerald-50", glyph: "▼", cls: "text-emerald-700" };
  if (r.direction === "分化") return { bg: "bg-slate-100", glyph: "◐", cls: "text-slate-600" };
  return { bg: "bg-gray-50", glyph: "—", cls: "text-gray-500" };
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

// 主线跳:人话主线 + 反转人话 + 依据行(置信度前置)+ 就近证据入口(PR1:
// 有匹配来源给「依据 N 条」,没有则 EvidencePanel 空态如实标「推理假设 · 待验证」)
function HopRow({ h, evidence, insightId }: { h: Hop; evidence: EvidenceItem[]; insightId: string }) {
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
      <div className="mt-1">
        <EvidencePanel
          insightId={insightId}
          targetType="hop"
          targetId={String(h.order)}
          items={evidence}
        />
      </div>
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
      {m.relationNote && (
        <span className="rounded bg-emerald-50 px-1.5 py-0.5 text-[10px] font-medium text-emerald-700">
          {m.relationNote}
        </span>
      )}
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

export default async function InsightPage({ params }: { params: { slug: string } }) {
  const c: InsightChain | undefined = INSIGHT_CHAINS[params.slug];
  if (!c) notFound();
  // 这条因果链对应的链页(chains.ts 里 insightSlug 指到本页的那条),CTA 回链 + 今日更新读库用
  const chainPage = Object.values(CHAINS).find((ch) => ch.insightSlug === c.slug);
  // 今日更新(PRD §8):当日 published daily 判断 + 热力摘要;无则不渲染(骨架照常)
  const daily = chainPage
    ? await getPublishedDaily(chainPage.id, todayISO()).catch(() => null)
    : null;

  // ---- References 就近可见(PR1):静态 references 经迁移期规则匹配绑到 hop/heat/mapping ----
  const staticEv = c.references.map(fromInsightRef);
  const hopEv = (order: number) => matchReferences({ type: "hop", order }, staticEv);
  const heatEv = (segment: string) => matchReferences({ type: "heat", segment }, staticEv);
  const mapEv = (m: StockMap) =>
    matchReferences({ type: "mapping", name: m.name, code: m.code, segment: m.segment }, staticEv);
  // 匹配不到任何判断的引用留「其他来源」,不硬绑(PRD §3.4)
  const matchedIds = new Set<string>();
  for (const h of c.mainHops) for (const e of hopEv(h.order)) matchedIds.add(e.id);
  for (const r of c.heatmap) for (const e of heatEv(r.segment)) matchedIds.add(e.id);
  for (const m of c.mappings) for (const e of mapEv(m)) matchedIds.add(e.id);
  const otherEv = staticEv.filter((e) => !matchedIds.has(e.id));
  // mapping 行的关系依据/验证点:走统一关系模型本链档(resolver 唯一入口;
  // chainIdFromSlug:insight slug ≠ 关系链 id,datacenter-power→data-center-power)
  const relChainId = chainIdFromSlug(params.slug);

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

        {daily && (
          <section className="mb-3 rounded-2xl bg-white p-4 shadow-sm ring-1 ring-brand-100">
            <div className="mb-1 flex items-baseline justify-between gap-2">
              <span className="text-xs font-medium text-brand-600">📡 今日更新 · {daily.date}</span>
              {/* 归档入口(2.1-W4):进入当日归档页,页内有前后日互链,构成 SEO 抓取路径 */}
              <Link
                href={`/insight/${params.slug}/${daily.date}`}
                className="text-meta text-gray-400 hover:text-brand-600"
              >
                链级每日推理 · 归档 →
              </Link>
            </div>
            <p className="text-sm leading-relaxed text-gray-800">{daily.payload.judgment}</p>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {daily.payload.heat
                .filter((h) => h.direction !== "观察")
                .slice(0, 5)
                .map((h) => (
                  <span key={h.segment} className="rounded bg-gray-50 px-1.5 py-0.5 text-[11px] text-gray-600">
                    {h.segment} {h.direction}
                  </span>
                ))}
            </div>
            <p className="mt-2 text-xs leading-relaxed text-gray-500">
              <span className="font-medium text-gray-600">今日风险</span>:{daily.payload.risk}
            </p>
            {/* PR1 P0:当日 references 前移到最新判断旁;PR3:v2 按 targets 选取(v1 兼容=全量) */}
            <div className="mt-1.5">
              <EvidencePanel
                insightId={params.slug}
                date={daily.date}
                targetType="judgment"
                targetId="daily"
                items={dailyRefsFor("judgment", daily.payload.references)}
                label={`今日依据 ${dailyRefsFor("judgment", daily.payload.references).length} 条`}
              />
            </div>
          </section>
        )}

        {/* ===== 10 秒层:事件一行 + 钩子 + 三行短句 + 风险 + 看票 ===== */}
        <div className="mb-3 rounded-2xl bg-brand-50/40 px-4 py-4 shadow-sm">
          <p className="text-[11px] leading-relaxed text-gray-500">
            <span className="mr-1 rounded bg-white/80 px-1 py-0.5 text-gray-500">🧪 演示事件</span>
            {c.eventPlain}
          </p>
          <p className="mt-2 text-[15px] font-medium leading-relaxed text-gray-900">{c.tldr.hook}</p>
          {/* 三层关系:一层一张小卡,固定结构 = 关系级别 / 环节 / 为什么(评审:别挤一行) */}
          <div className="mt-3 space-y-1.5">
            {c.tldr.tiers.map((t) => {
              const card = (
                <div className="rounded-lg bg-white/80 px-3 py-2 shadow-sm">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span>{t.emoji}</span>
                    <span
                      className={`rounded px-1.5 py-0.5 text-[11px] font-medium ${
                        t.rel ? REL_CHIP_CLS_SHORT[t.rel] : "bg-gray-100 text-gray-500"
                      }`}
                    >
                      {t.level}
                    </span>
                    <b className="text-sm font-semibold text-gray-900">{t.what}</b>
                    {t.rel && (
                      <span className="ml-auto shrink-0 text-[11px] text-brand-400">
                        看这级的票 →
                      </span>
                    )}
                  </div>
                  <p className="mt-0.5 text-xs leading-relaxed text-gray-500">{t.why}</p>
                </div>
              );
              return t.rel ? (
                <a key={t.level} href={`#rel-${t.rel}`} className="block">
                  {card}
                </a>
              ) : (
                <div key={t.level}>{card}</div>
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
        <Section icon="🧭" title="真正关键就两步" sub={c.hopsNote}>
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
              这两步的依据(证据 · 置信度 · 什么情况会反转)
            </summary>
            <ul className="mt-2 space-y-1.5">
              {c.mainHops.map((h) => (
                <HopRow key={h.order} h={h} evidence={hopEv(h.order)} insightId={params.slug} />
              ))}
            </ul>
          </details>
        </Section>

        {/* 热力:默认人话层(环节/方向/关系/置信/一句话),展开专业层 */}
        <Section icon="🔥" title="产业链热力(哪段在升温)" sub={c.heatmapNote}>
          <div className="space-y-1.5">
            {c.heatmap.map((r, i) => {
              const t = rowTint(r);
              const hop = r.hopOrder ? c.branchHops.find((h) => h.order === r.hopOrder) : undefined;
              return (
                <div key={i} className={`rounded-lg px-3 py-2 ${t.bg}`}>
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="text-sm font-medium text-gray-900">{r.segment}</span>
                    <span className={`text-[11px] font-medium ${t.cls}`}>
                      {t.glyph} {r.direction}
                    </span>
                    {r.relation && <Pill text={r.relation} cls={REL_CHIP_CLS_SHORT[r.relation]} />}
                    {r.confidence && <Pill text={`置信 ${r.confidence}`} cls={CONF[r.confidence]} />}
                  </div>
                  <p className="mt-0.5 text-xs leading-relaxed text-gray-700">{r.plain}</p>
                  <details className="mt-0.5">
                    <summary className="cursor-pointer text-[11px] text-gray-500/80">
                      怎么传到这的 · 专业依据
                    </summary>
                    <div className="mt-1 space-y-1">
                      {hop && <p className="text-xs leading-relaxed text-gray-700">{hop.plain}</p>}
                      {hop?.caveatPlain && (
                        <p className="rounded bg-white/70 px-2 py-1 text-[11px] leading-relaxed text-rose-700">
                          ⚠️ {hop.caveatPlain}
                        </p>
                      )}
                      <p className="text-[11px] leading-relaxed text-gray-600">{r.reason}</p>
                      {hop && (
                        <p className="text-[11px] leading-relaxed text-gray-600">
                          依据·{hop.evidenceType}
                          {hop.evidenceExample ? `:${hop.evidenceExample}` : ""}
                        </p>
                      )}
                      {/* PR1:环节级来源就近可见;无匹配来源=如实标推理假设 */}
                      <EvidencePanel
                        insightId={params.slug}
                        targetType="heat"
                        targetId={r.segment}
                        items={heatEv(r.segment)}
                      />
                    </div>
                  </details>
                </div>
              );
            })}
          </div>
          <p className="mt-1.5 text-[11px] leading-relaxed text-gray-400">
            颜色越深 = 和这次事件的关联越强、证据越足(不是涨幅)。
          </p>
        </Section>

        {/* 票:名单常显(单行),依据收进组级折叠 */}
        <Section id="mappings" icon="🔗" title="国内相关的票(按关系分级,不是推荐)" sub={c.mappingNote}>
          <div className="space-y-3">
            {REL_GROUPS.map((g) => {
              const items = c.mappings.filter((m) =>
                g.rel === "情绪映射" ? m.relation === "情绪映射" || m.relation === "弱" : m.relation === g.rel
              );
              if (items.length === 0) return null;
              // 每组默认只展开前 3 只,其余折叠(评审:16 只全展开页面太长)
              const HEAD = 3;
              const head = items.slice(0, HEAD);
              const rest = items.slice(HEAD);
              return (
                <div key={g.rel} id={`rel-${g.rel}`} className="scroll-mt-16">
                  <p className="text-xs font-semibold text-gray-700">{g.label}</p>
                  {g.hint && (
                    <p className="mb-0.5 text-[11px] leading-relaxed text-gray-400">{g.hint}</p>
                  )}
                  <ul>
                    {head.map((m) => (
                      <MappingRow key={m.name} m={m} />
                    ))}
                  </ul>
                  {rest.length > 0 && (
                    <details>
                      <summary className="cursor-pointer px-2 py-1 text-xs font-medium text-brand-600">
                        展开其余 {rest.length} 只
                      </summary>
                      <ul className="mt-0.5">
                        {rest.map((m) => (
                          <MappingRow key={m.name} m={m} />
                        ))}
                      </ul>
                    </details>
                  )}
                  <details>
                    <summary className="cursor-pointer text-[11px] text-gray-400">
                      为什么是这几只 · 关系依据 / 验证点
                    </summary>
                    <ul className="mt-1 space-y-1.5">
                      {items.map((m) => {
                        // 关系依据 = 统一关系模型本链档的 references + 静态引用按名/码/环节匹配(去重)
                        const rel = m.code ? resolveInChain(m.code, relChainId) : null;
                        const seen = new Set<string>();
                        const evidence = [
                          ...(rel?.references ?? []).map(fromRelationRef),
                          ...mapEv(m),
                        ].filter((e) => (seen.has(e.id) ? false : (seen.add(e.id), true)));
                        return (
                          <li key={m.name} className="text-xs leading-relaxed text-gray-500">
                            <b className="text-gray-600">{m.name}</b>
                            {rel?.evidenceStatus && EVIDENCE_LABEL[rel.evidenceStatus] && (
                              <span className="ml-1 rounded bg-gray-100 px-1 py-0.5 text-[11px] text-gray-500">
                                {EVIDENCE_LABEL[rel.evidenceStatus]}
                              </span>
                            )}
                            :{m.reason}
                            {rel && rel.verificationPoints.length > 0 && (
                              <span className="block text-[11px] text-gray-400">
                                验证点:{rel.verificationPoints.slice(0, 3).join(" / ")}
                              </span>
                            )}
                            <EvidencePanel
                              insightId={params.slug}
                              targetType="mapping"
                              targetId={m.code ?? m.name}
                              items={evidence}
                              label={`关系依据 ${evidence.length} 条`}
                              emptyText="关系依据待补 · 以验证点自行核实"
                            />
                          </li>
                        );
                      })}
                    </ul>
                  </details>
                </div>
              );
            })}
          </div>
          <p className="mt-3 rounded-lg bg-gray-50 px-3 py-2 text-xs leading-relaxed text-gray-500">
            本页关系来自 <b className="text-gray-600">staticRelations</b>(经人工审阅的长期产业链关系档);daily signals 只影响「今日触发」,
            不自动改变长期关系档。关系档是「研究框架梳理·非确认」,不构成投资建议。
          </p>
        </Section>

        {/* 易看错 + references */}
        <Section icon="⚠️" title="这条链最容易看错的地方">
          <ul className="space-y-1 text-xs leading-relaxed text-gray-600">
            {c.uncertainties.map((u, i) => (
              <li key={i}>· {u}</li>
            ))}
          </ul>
          {/* PR1:引用已就近绑到 hop/heat/mapping;匹配不到具体判断的留这里,不硬绑 */}
          {otherEv.length > 0 && (
            <div className="mt-2.5">
              <EvidencePanel
                insightId={params.slug}
                targetType="other"
                targetId="unmatched"
                items={otherEv}
                label={`其他来源(未绑定到具体判断)· ${otherEv.length} 条`}
              />
            </div>
          )}
        </Section>

        {/* ===== CTA:真按钮,不做交易导向 ===== */}
        <div className="mb-3 rounded-xl bg-white px-4 py-3.5 shadow-sm">
          <p className="text-sm font-semibold text-gray-800">接下来,跟住这条链</p>
          <div className="mt-2.5 flex flex-wrap gap-2">
            <a
              href="#mappings"
              className="inline-flex min-h-[40px] items-center gap-1 rounded-lg bg-brand-600 px-3.5 py-2 text-sm font-medium text-white transition-colors hover:bg-brand-700"
            >
              ⭐ 把相关的票加进自选,跟踪后续验证
            </a>
            {chainPage && (
              <Link
                href={`/chain/${chainPage.id}`}
                className="inline-flex min-h-[40px] items-center gap-1 rounded-lg bg-gray-100 px-3.5 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-200"
              >
                📡 看这条链今天怎么动
              </Link>
            )}
            <Link
              href="/settings"
              className="inline-flex min-h-[40px] items-center gap-1 rounded-lg bg-gray-100 px-3.5 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-200"
            >
              📬 订阅这条链的每日变化
            </Link>
          </div>
          <p className="mt-2 text-[11px] leading-relaxed text-gray-400">
            不喊单:这些动作只是帮你持续跟着这条链的验证节奏,不构成任何操作建议。
          </p>
        </div>

        {/* 方法说明:给评审/较真的看,沉底折叠(产品用结构证明自己,不反复自辩) */}
        <details className="mb-3 px-1 text-xs text-gray-400">
          <summary className="cursor-pointer">完整判断 · 方法说明(给较真的你)</summary>
          <div className="mt-1.5 space-y-1.5 leading-relaxed text-gray-500">
            <p>
              <b className="text-gray-600">完整判断(人话):</b>
              {c.oneLinerPlain}
            </p>
            <p>
              <b className="text-gray-600">专业口径:</b>
              {c.oneLiner}
            </p>
            <p>
              <b className="text-gray-600">事件专业表述:</b>
              {c.event}
            </p>
            <p className="pt-1 font-medium text-gray-600">为什么这不是新闻聚合:</p>
            {c.differentiators.map((d, i) => (
              <p key={i}>· {d}</p>
            ))}
            <p className="text-gray-400">{c.whyThisEvent}</p>
          </div>
        </details>

        <p className="mb-2 text-meta leading-relaxed text-gray-400">🧪 {c.eventNote}</p>
        <p className="text-meta leading-relaxed text-gray-400">{c.disclaimer}</p>
      </main>
    </div>
  );
}
