import Link from "next/link";
import { notFound } from "next/navigation";
import { SiteHeader } from "@/components/SiteHeader";
import { FeedbackLink } from "@/components/FeedbackLink";
import { STOCK_MAP } from "@/data/stocks";
import {
  INSIGHT_CHAINS,
  type InsightChain,
  type Hop,
  type StockMap,
  type Relation,
  type Confidence,
} from "@/data/insight-chains";

// 推理链详情页(内核最小可证 · 隔离实验)。静态预生成,不进导航/首页。
// 产品化三层:首屏结论卡(10秒)→ 热力图 + 多跳因果链(1分钟)→ 深度核验(证据/不确定性)。人话为主。
export const dynamic = "force-static";
export function generateStaticParams() {
  return Object.keys(INSIGHT_CHAINS).map((slug) => ({ slug }));
}

const HEAT: Record<string, { box: string; bar: string }> = {
  升温: { box: "bg-orange-50 text-orange-700", bar: "text-orange-400" },
  降温: { box: "bg-slate-100 text-slate-500", bar: "text-slate-300" },
  分化: { box: "bg-violet-50 text-violet-700", bar: "text-violet-300" },
  中性: { box: "bg-gray-100 text-gray-500", bar: "text-gray-300" },
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
  { rel: "情绪映射", label: "⬜ 情绪映射", hint: "可能被热度带动,但不等于这次事件的直接受益方,真金白银看订单" },
  { rel: "弱", label: "弱关联", hint: "" },
];

function Section({
  icon,
  title,
  children,
  sub,
}: {
  icon: string;
  title: string;
  children: React.ReactNode;
  sub?: string;
}) {
  return (
    <section className="mb-3.5 rounded-xl bg-white px-4 py-3.5 shadow-sm">
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

function HopRow({ h }: { h: Hop }) {
  return (
    <li className="rounded-lg bg-gray-50 px-3 py-2.5">
      {/* 人话主线 */}
      <p className="text-sm leading-relaxed text-gray-800">{h.plain}</p>
      {/* 反转/证伪的人话(醒目) */}
      {h.caveatPlain && (
        <p className="mt-1.5 rounded bg-rose-50/70 px-2 py-1 text-xs leading-relaxed text-rose-700">
          ⚠️ {h.caveatPlain}
        </p>
      )}
      {/* 专业细节(次要,想深挖的看) */}
      <div className="mt-1.5 flex flex-wrap items-center gap-x-1.5 gap-y-1 text-[11px] text-gray-400">
        <span className="rounded bg-white px-1 py-0.5 font-medium text-gray-500">
          {h.from} → {h.to}
        </span>
        <Pill text={`置信 ${h.confidence}`} cls={CONF[h.confidence]} />
      </div>
      <p className="mt-1 text-[11px] leading-relaxed text-gray-400">
        依据·{h.evidenceType}
        {h.evidenceExample ? `:${h.evidenceExample}` : ""}
      </p>
    </li>
  );
}

function Mapping({ m }: { m: StockMap }) {
  const inPool = m.code ? !!STOCK_MAP[m.code] : false;
  const head = (
    <>
      <span className="font-medium text-gray-800">{m.name}</span>
      {m.code && <span className="font-mono text-xs text-gray-400">{m.code}</span>}
      <span className="text-xs text-gray-400">· {m.segment}</span>
      <Pill text={`置信 ${m.confidence}`} cls={CONF[m.confidence]} />
    </>
  );
  return (
    <li>
      {inPool && m.code ? (
        <Link
          href={`/stock/${m.code}`}
          className="-mx-2 flex flex-wrap items-center gap-1.5 rounded-lg px-2 py-1.5 transition-colors hover:bg-gray-50 active:bg-gray-50"
        >
          {head}
          <span className="text-[11px] text-brand-400">看个股 →</span>
        </Link>
      ) : (
        <div className="flex flex-wrap items-center gap-1.5 px-2 py-1.5">{head}</div>
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
      <main className="mx-auto max-w-2xl px-4 py-6 sm:px-6">
        <header className="mb-3">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-h1 font-semibold tracking-tight">{c.title}</h1>
            <span className="rounded-full bg-brand-100 px-2 py-0.5 text-[11px] font-medium text-brand-700">
              推理链 · 内核实验
            </span>
          </div>
          <p className="mt-1 text-xs text-gray-400">
            更新 {c.updatedAt} · 一件全球事件,如何一路传到 A 股
          </p>
        </header>

        {/* ===== 第一层:10 秒懂(极简,像张图一眼扫完)===== */}
        <div className="mb-3 rounded-2xl bg-white px-4 py-4 shadow-sm ring-1 ring-inset ring-brand-100">
          <p className="text-[15px] font-medium leading-relaxed text-gray-900">{c.tldr.hook}</p>
          <div className="mt-3 space-y-2.5">
            {c.tldr.tiers.map((t) => (
              <div key={t.level} className="flex items-start gap-2.5">
                <span className="mt-0.5 shrink-0 text-lg leading-none">{t.emoji}</span>
                <div className="min-w-0">
                  <div className="flex flex-wrap items-baseline gap-x-2">
                    <span className="shrink-0 text-[11px] font-medium text-gray-400">{t.level}</span>
                    <span className="text-sm font-semibold text-gray-900">{t.what}</span>
                  </div>
                  <p className="text-xs leading-relaxed text-gray-500">{t.why}</p>
                </div>
              </div>
            ))}
          </div>
          <p className="mt-3 rounded-lg bg-rose-50/70 px-3 py-2 text-xs leading-relaxed text-rose-800">
            <span className="font-medium text-rose-600">⚠️ 一句话风险:</span>
            {c.tldr.risk}
          </p>
        </div>

        {/* 再具体点:这次到底变了啥(事件 delta,一句人话)*/}
        <div className="mb-3 rounded-xl bg-gray-50 px-4 py-3">
          <p className="text-[11px] font-medium text-gray-500">这次到底变了啥</p>
          <p className="mt-0.5 text-sm leading-relaxed text-gray-700">{c.deltaPlain}</p>
        </div>

        {/* 事件(简短)+ 占位提示 */}
        <Section icon="📰" title="事件">
          <p className="text-sm leading-relaxed text-gray-700">{c.event}</p>
          <p className="mt-2 rounded border border-amber-200 bg-amber-50/50 px-2.5 py-1.5 text-[11px] leading-relaxed text-amber-700">
            🧪 演示用占位事件:{c.eventNote}
          </p>
        </Section>

        {/* ===== 第二层:热力图 + 多跳因果链(1 分钟看明白)===== */}
        <Section icon="🔥" title="产业链热力(哪些环节在升温)" sub={c.heatmapNote}>
          <div className="space-y-2">
            {c.heatmap.map((r, i) => (
              <div key={i} className="rounded-lg bg-gray-50 px-3 py-2">
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="text-sm font-medium text-gray-800">{r.segment}</span>
                  <Pill text={r.direction} cls={HEAT[r.direction].box} />
                  <span className={`font-mono text-xs ${HEAT[r.direction].bar}`}>
                    {"▮".repeat(r.intensity)}
                    <span className="text-gray-200">{"▮".repeat(5 - r.intensity)}</span>
                  </span>
                  {r.relation && <Pill text={r.relation} cls={REL[r.relation]} />}
                  {r.confidence && <Pill text={`置信 ${r.confidence}`} cls={CONF[r.confidence]} />}
                </div>
                <p className="mt-1 text-xs leading-relaxed text-gray-600">
                  <span className="text-gray-500">这是啥:</span>
                  {r.plain}
                </p>
                <p className="mt-0.5 text-[11px] leading-relaxed text-gray-400">{r.reason}</p>
              </div>
            ))}
          </div>
        </Section>

        <Section
          icon="🧭"
          title="这事怎么一步步传到股票的"
          sub={c.hopsNote}
        >
          <p className="mb-1 text-xs font-medium text-gray-600">主线(一环扣一环)</p>
          <ul className="space-y-1.5">
            {c.mainHops.map((h) => (
              <HopRow key={h.order} h={h} />
            ))}
          </ul>
          <p className="mb-1 mt-3 text-xs font-medium text-gray-600">
            由此扇出的相关环节(和这次事件关系没主线那么紧)
          </p>
          <ul className="space-y-1.5">
            {c.branchHops.map((h) => (
              <HopRow key={h.order} h={h} />
            ))}
          </ul>
        </Section>

        {/* 国内标的 — 按关系分组 */}
        <Section icon="🔗" title="国内相关的票(按关系分级,不是推荐)" sub={c.mappingNote}>
          <div className="space-y-3">
            {REL_GROUPS.map((g) => {
              const items = c.mappings.filter((m) => m.relation === g.rel);
              if (items.length === 0) return null;
              return (
                <div key={g.rel}>
                  <p className="text-xs font-semibold text-gray-700">{g.label}</p>
                  {g.hint && <p className="mb-1 text-[11px] leading-relaxed text-gray-400">{g.hint}</p>}
                  <ul className="space-y-1">
                    {items.map((m) => (
                      <Mapping key={m.name} m={m} />
                    ))}
                  </ul>
                </div>
              );
            })}
          </div>
        </Section>

        {/* ===== 第三层:深度核验 ===== */}
        <Section icon="⚠️" title="要提醒你的(诚实说)">
          <ul className="space-y-1 text-xs leading-relaxed text-gray-600">
            {c.uncertainties.map((u, i) => (
              <li key={i}>· {u}</li>
            ))}
          </ul>
          <details className="mt-2.5 text-xs text-gray-500">
            <summary className="cursor-pointer text-gray-500">完整判断 · 凭什么不是「新闻聚合」· 方法</summary>
            <div className="mt-1.5 space-y-1.5 leading-relaxed">
              <p className="text-gray-600">
                <b className="text-gray-700">完整判断:</b>
                {c.oneLiner}
              </p>
              <p className="pt-1 font-medium text-gray-600">凭什么不是新闻聚合:</p>
              {c.differentiators.map((d, i) => (
                <p key={i}>· {d}</p>
              ))}
              <p className="text-gray-400">{c.whyThisEvent}</p>
            </div>
          </details>
        </Section>

        {/* 合规 CTA(关注/加自选/反馈,不做交易导向) */}
        <div className="mb-3.5 rounded-xl bg-white px-4 py-3 text-xs text-gray-500 shadow-sm">
          <span className="font-medium text-gray-700">接下来:</span> 点上方任意标的可看个股 / 加自选;
          「订阅这条链的更新 · 看它最近的历史联动复盘」规划中。有想法?
          <span className="ml-1 inline-flex align-middle">
            <FeedbackLink />
          </span>
        </div>

        <p className="text-meta leading-relaxed text-gray-400">{c.disclaimer}</p>
      </main>
    </div>
  );
}
