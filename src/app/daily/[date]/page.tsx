import Link from "next/link";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { SiteHeader } from "@/components/SiteHeader";
import { listBriefing, listBriefingDates } from "@/lib/briefings";
import { getBriefStatus, BRIEF_STATUS_UI, type BriefTone } from "@/lib/brief-status";
import { getHolidayBridge } from "@/lib/holiday-bridge";
import { IMPACT_META } from "@/lib/impact";
import type { Impact } from "@/lib/briefings";
import { DISCLAIMER } from "@/lib/constants";

// 历史简报归档页(2.1-W4):某日的简报条目 + 当日五档状态 + 节后观察(如有)。
// 状态口径与首页同源(BRIEF_STATUS_UI):fallback 展示"模板兜底"徽章绝不伪装 generated,
// market_closed 日即使 0 条也有状态可解释——归档层完整回答"那天为什么没有/是什么口径"。
export const revalidate = 3600;

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export async function generateMetadata({
  params,
}: {
  params: { date: string };
}): Promise<Metadata> {
  if (!DATE_RE.test(params.date)) return {};
  return {
    title: `${params.date} 产业链简报归档:隔夜事件与 A 股映射 | StockTell`,
    description: `${params.date} 的产业链推理简报归档:隔夜美股事件、传导环节与 A 股映射(研究框架梳理·非确认,不构成投资建议)。`,
    alternates: { canonical: `https://www.stocktell.me/daily/${params.date}` },
  };
}

const TONE_BOX: Record<BriefTone, string> = {
  info: "bg-emerald-50 text-emerald-700",
  neutral: "bg-slate-100 text-slate-600",
  attention: "bg-amber-50 text-amber-800",
  warn: "bg-rose-50 text-rose-700",
};

export default async function DailyArchivePage({ params }: { params: { date: string } }) {
  if (!DATE_RE.test(params.date)) notFound();
  const date = params.date;
  const [items, status, dates] = await Promise.all([
    listBriefing({ date, status: "published" }).catch(() => []),
    getBriefStatus(date).catch(() => null),
    listBriefingDates(120).catch(() => [] as string[]),
  ]);
  const bridge =
    status?.subType === "holiday_bridge" ? await getHolidayBridge(date).catch(() => null) : null;
  // 既无条目也无状态记录的日期不是归档(周末/未来日)→ 404,不硬造空页
  if (items.length === 0 && !status) notFound();
  const idx = dates.indexOf(date);
  const newer = idx > 0 ? dates[idx - 1] : null;
  const older = idx >= 0 && idx < dates.length - 1 ? dates[idx + 1] : null;
  const ui = status ? BRIEF_STATUS_UI[status.status] : null;

  return (
    <div className="min-h-screen bg-canvas text-ink">
      <SiteHeader active="今日推理" />
      <main className="mx-auto max-w-3xl px-4 py-6 sm:px-6">
        <header className="mb-4">
          <p className="text-xs text-gray-400">
            <Link href="/daily" className="text-brand-600 hover:underline">
              简报归档
            </Link>
          </p>
          <h1 className="mt-1 text-h1 font-semibold tracking-tight">{date} · 产业链简报</h1>
          {ui && (
            <div className="mt-1.5 flex flex-wrap items-center gap-2 text-xs">
              <span className={`rounded px-1.5 py-0.5 font-medium ${TONE_BOX[ui.tone]}`}>{ui.badge}</span>
              <span className="text-gray-400">{status?.message ?? ui.note}</span>
            </div>
          )}
        </header>

        {bridge && (
          <section className="mb-3 rounded-2xl bg-white p-4 shadow-sm">
            <h2 className="text-sm font-semibold text-gray-800">{bridge.title}</h2>
            <p className="mt-1 text-xs leading-relaxed text-gray-500">{bridge.note}</p>
            {bridge.recap.length > 0 && (
              <ul className="mt-2 space-y-1">
                {bridge.recap.map((r, i) => (
                  <li key={i} className="text-xs leading-relaxed text-gray-600">
                    <span className="mr-1">{IMPACT_META[r.impact as Impact]?.emoji}</span>
                    {r.title}
                    {r.beneficiaries.length > 0 && (
                      <span className="text-gray-400">
                        {" "}
                        → {r.beneficiaries.map((b) => b.name).join(" / ")}
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </section>
        )}

        {items.length > 0 ? (
          <section className="space-y-2.5">
            {items.map((it) => (
              <article key={it.id} className="rounded-2xl bg-white p-4 shadow-sm">
                <div className="flex items-center gap-2">
                  <span className={`h-2 w-2 shrink-0 rounded-full ${IMPACT_META[it.impact].dotClass}`} />
                  <h2 className="text-sm font-medium text-gray-900">{it.title}</h2>
                </div>
                {it.beneficiaries.length > 0 && (
                  <p className="mt-1 text-xs text-gray-500">
                    关联标的:
                    {it.beneficiaries.map((b, i) => (
                      <span key={b.code}>
                        {i > 0 && " / "}
                        <Link href={`/stock/${b.code}`} className="text-brand-600 hover:underline">
                          {b.name}
                        </Link>
                      </span>
                    ))}
                  </p>
                )}
                <p className="mt-1.5 text-xs leading-relaxed text-gray-600">{it.retailTake}</p>
              </article>
            ))}
          </section>
        ) : (
          <div className="rounded-xl border border-dashed border-gray-300 bg-white py-10 text-center text-sm text-gray-500">
            该日无新简报{ui ? `(${ui.badge})` : ""}
          </div>
        )}

        <nav className="mb-4 mt-4 flex items-center justify-between text-xs">
          {older ? (
            <Link href={`/daily/${older}`} className="text-brand-600 hover:underline">
              ← {older}
            </Link>
          ) : (
            <span />
          )}
          <Link href="/" className="text-gray-400 hover:text-gray-600">
            查看今日
          </Link>
          {newer ? (
            <Link href={`/daily/${newer}`} className="text-brand-600 hover:underline">
              {newer} →
            </Link>
          ) : (
            <span />
          )}
        </nav>

        <p className="text-center text-xs leading-relaxed text-gray-400">
          历史归档反映当日判断,不随后市更新;关系标注为研究框架梳理·非确认。{DISCLAIMER}
        </p>
      </main>
    </div>
  );
}
