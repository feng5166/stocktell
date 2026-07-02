import Link from "next/link";
import { notFound } from "next/navigation";
import { SiteHeader } from "@/components/SiteHeader";
import { STOCK_MAP } from "@/data/stocks";
import {
  INSIGHT_CHAINS,
  type InsightChain,
  type Hop,
  type HeatRow,
  type StockMap,
  type Relation,
  type Confidence,
} from "@/data/insight-chains";

// 推理链详情页(内核最小可证 · 隔离实验)。静态预生成,不进导航/首页。
export const dynamic = "force-static";
export function generateStaticParams() {
  return Object.keys(INSIGHT_CHAINS).map((slug) => ({ slug }));
}

// 热力方向配色(产业景气维度,刻意避开红绿——红绿仅留给价格数据)
const HEAT: Record<string, { box: string; label: string }> = {
  升温: { box: "bg-orange-50 text-orange-700", label: "升温" },
  降温: { box: "bg-slate-100 text-slate-500", label: "降温" },
  分化: { box: "bg-violet-50 text-violet-700", label: "分化" },
  中性: { box: "bg-gray-100 text-gray-500", label: "中性" },
};
// 关系分级配色
const REL: Record<Relation, string> = {
  直接: "bg-rose-100 text-rose-700",
  间接: "bg-amber-100 text-amber-700",
  情绪映射: "bg-slate-100 text-slate-500",
  弱: "bg-gray-200 text-gray-500",
};
// 置信度配色
const CONF: Record<Confidence, string> = {
  高: "bg-sky-100 text-sky-700",
  中: "bg-amber-50 text-amber-700",
  低: "bg-gray-100 text-gray-500",
  假设: "bg-rose-50 text-rose-600",
};

function Section({
  icon,
  title,
  children,
  highlight,
}: {
  icon: string;
  title: string;
  children: React.ReactNode;
  highlight?: boolean;
}) {
  return (
    <section
      className={`mb-4 rounded-xl px-4 py-3.5 shadow-sm ${
        highlight ? "bg-brand-50/50 ring-1 ring-inset ring-brand-100" : "bg-white"
      }`}
    >
      <h2 className="mb-2.5 flex items-center gap-2 text-sm font-semibold text-gray-800">
        <span>{icon}</span>
        {title}
      </h2>
      {children}
    </section>
  );
}

function ConfBadge({ c }: { c: Confidence }) {
  return (
    <span className={`shrink-0 rounded px-1.5 py-0.5 text-[11px] ${CONF[c]}`}>
      置信 {c}
    </span>
  );
}

function HopRow({ h }: { h: Hop }) {
  return (
    <li className="rounded-lg bg-gray-50 px-3 py-2.5">
      <div className="flex flex-wrap items-center gap-x-1.5 gap-y-1 text-sm">
        <span className="font-medium text-gray-800">{h.from}</span>
        <span className="text-gray-300">→</span>
        <span className="font-medium text-brand-700">{h.to}</span>
        <span className="ml-auto flex items-center gap-1">
          <ConfBadge c={h.confidence} />
        </span>
      </div>
      <p className="mt-1 text-xs leading-relaxed text-gray-600">{h.logic}</p>
      <p className="mt-1 text-[11px] leading-relaxed text-gray-500">
        依据·{h.evidenceType}
        {h.evidenceExample ? `:${h.evidenceExample}` : ""}
      </p>
      {h.caveat && (
        <p className="mt-1 rounded bg-rose-50/70 px-2 py-1 text-[11px] leading-relaxed text-rose-700">
          ⚠️ {h.caveat}
        </p>
      )}
    </li>
  );
}

function Mapping({ m }: { m: StockMap }) {
  const inPool = m.code ? !!STOCK_MAP[m.code] : false;
  const inner = (
    <>
      <span className={`shrink-0 rounded px-1.5 py-0.5 text-[11px] ${REL[m.relation]}`}>
        {m.relation}
      </span>
      <span className="font-medium text-gray-800">{m.name}</span>
      {m.code && <span className="font-mono text-xs text-gray-400">{m.code}</span>}
      <span className="text-xs text-gray-400">· {m.segment}</span>
      <ConfBadge c={m.confidence} />
    </>
  );
  return (
    <li>
      {inPool && m.code ? (
        <Link
          href={`/stock/${m.code}`}
          className="-mx-2 flex flex-wrap items-center gap-1.5 rounded-lg px-2 py-1.5 transition-colors hover:bg-gray-50 active:bg-gray-50"
        >
          {inner}
        </Link>
      ) : (
        <div className="flex flex-wrap items-center gap-1.5 px-2 py-1.5">{inner}</div>
      )}
      <p className="px-2 pb-1 text-xs leading-relaxed text-gray-500">{m.reason}</p>
    </li>
  );
}

export default function InsightPage({ params }: { params: { slug: string } }) {
  const c: InsightChain | undefined = INSIGHT_CHAINS[params.slug];
  if (!c) notFound();

  return (
    <div className="min-h-screen bg-canvas text-ink">
      <SiteHeader />
      <main className="mx-auto max-w-3xl px-4 py-6 sm:px-6">
        <header className="mb-4">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-h1 font-semibold tracking-tight">{c.title}</h1>
            <span className="rounded-full bg-brand-100 px-2 py-0.5 text-[11px] font-medium text-brand-700">
              推理链 · 内核实验
            </span>
          </div>
          <p className="mt-1 text-xs text-gray-400">更新 {c.updatedAt}</p>
        </header>

        {/* 占位事件提示(诚实) */}
        <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50/60 px-3 py-2 text-xs leading-relaxed text-amber-800">
          🧪 演示用占位事件:{c.eventNote}
        </div>

        <Section icon="📰" title="事件">
          <p className="text-sm leading-relaxed text-gray-700">{c.event}</p>
          <p className="mt-2 rounded-lg bg-gray-50 px-3 py-2 text-xs leading-relaxed text-gray-600">
            <b className="text-gray-800">为什么是「这一个」事件</b>:{c.whyThisEvent}
          </p>
        </Section>

        <Section icon="💡" title="一句话判断" highlight>
          <p className="text-sm leading-relaxed text-gray-800">{c.oneLiner}</p>
          <div className="mt-2.5 space-y-1">
            <p className="text-xs font-medium text-gray-600">强于资讯聚合的地方:</p>
            {c.differentiators.map((d, i) => (
              <p key={i} className="text-xs leading-relaxed text-gray-600">
                {i + 1}. {d}
              </p>
            ))}
          </div>
        </Section>

        <Section icon="🔥" title="产业链热力">
          <p className="mb-2 text-[11px] leading-relaxed text-gray-500">{c.heatmapNote}</p>
          <div className="space-y-1.5">
            {c.heatmap.map((r: HeatRow, i) => (
              <div key={i} className="flex flex-wrap items-center gap-x-2 gap-y-1">
                <span className="w-40 shrink-0 text-sm font-medium text-gray-800">
                  {r.segment}
                </span>
                <span className={`shrink-0 rounded px-1.5 py-0.5 text-[11px] ${HEAT[r.direction].box}`}>
                  {HEAT[r.direction].label}
                </span>
                <span className="shrink-0 font-mono text-xs tracking-tight text-gray-400">
                  {"▮".repeat(r.intensity)}
                  <span className="text-gray-200">{"▮".repeat(5 - r.intensity)}</span>
                </span>
                <span className="basis-full text-xs leading-relaxed text-gray-500 sm:basis-auto sm:flex-1">
                  {r.reason}
                </span>
              </div>
            ))}
          </div>
        </Section>

        <Section icon="🧭" title="多跳因果链">
          <p className="mb-2 text-[11px] leading-relaxed text-gray-500">{c.hopsNote}</p>
          <p className="mb-1 text-xs font-medium text-gray-600">主推理链(递进)</p>
          <ul className="space-y-1.5">
            {c.mainHops.map((h) => (
              <HopRow key={h.order} h={h} />
            ))}
          </ul>
          <p className="mb-1 mt-3 text-xs font-medium text-gray-600">
            并行资产映射分支(由「GPU/数据中心↑」扇出,对本事件边际敏感度较低)
          </p>
          <ul className="space-y-1.5">
            {c.branchHops.map((h) => (
              <HopRow key={h.order} h={h} />
            ))}
          </ul>
        </Section>

        <Section icon="🔗" title="国内产业链关联标的">
          <p className="mb-2 text-[11px] leading-relaxed text-gray-500">{c.mappingNote}</p>
          <ul className="space-y-1.5">
            {c.mappings.map((m) => (
              <Mapping key={m.name} m={m} />
            ))}
          </ul>
        </Section>

        <Section icon="⚠️" title="已知不确定性(诚实自曝)">
          <ul className="space-y-1 text-xs leading-relaxed text-gray-600">
            {c.uncertainties.map((u, i) => (
              <li key={i}>· {u}</li>
            ))}
          </ul>
        </Section>

        <p className="mt-4 text-meta leading-relaxed text-gray-400">{c.disclaimer}</p>
      </main>
    </div>
  );
}
