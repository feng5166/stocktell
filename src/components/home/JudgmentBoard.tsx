"use client";

// 首屏块①「今天最值得你知道的 3 件事」+ 块③「旧判断复核」(2.2.5→2.2.7)。
// 不是今日新闻,是系统排完优先级后的压缩判断:headline 人话 → 一段解释 → 「我怎么看」。
// 2.2.6:「与昨日相比」变化行,变了的链 rank+3/项。
// 2.2.7:优先级由自选决定——SSR 全局排序,水合后自选所在链再 +boost 重排并标「自选 N 只」;
// 无自选用户前后一致零闪动(负责人拍板:首页由自选/持仓决定,不是全市场平均展示)。
import Link from "next/link";
import type { ChainJudgment, JudgmentReviewEntry } from "@/lib/judgment";
import type { JudgmentChange } from "@/lib/judgment-diff";
import { INTENT_CHIP_CLS, fmtYmd } from "@/lib/market-intent/ui";
import { useWatchAffinity } from "@/components/home/useWatchAffinity";

type Judged = ChainJudgment & { changes?: JudgmentChange[] };

export function JudgmentBoard({
  ymd,
  judgments,
  hadPrev = false,
}: {
  ymd: string;
  judgments: Judged[];
  hadPrev?: boolean;
}) {
  const aff = useWatchAffinity();
  if (judgments.length === 0) return null;
  const myCount = (j: Judged) => aff.chainCount.get(j.chainSlug) ?? 0;
  const score = (j: Judged) =>
    j.rank + (j.changes?.length ?? 0) * 3 + Math.min(myCount(j), 3) * 2;
  const ordered = judgments.slice().sort((a, b) => score(b) - score(a));
  const top = ordered.slice(0, 3);
  const anyChange = judgments.some((j) => (j.changes?.length ?? 0) > 0);
  return (
    <section className="mt-5">
      <div className="flex items-baseline justify-between">
        <h2 className="text-h2 font-semibold text-gray-900">今天最值得知道的 {top.length} 件事</h2>
        <span className="text-meta text-gray-400">{fmtYmd(ymd)} 盘后合成</span>
      </div>
      <div className="mt-3 space-y-2">
        {top.map((j, idx) => (
          <Link
            key={j.chainSlug}
            href={j.href}
            className="block rounded-xl bg-white p-4 shadow-sm transition-colors hover:bg-brand-50/40"
          >
            <div className="flex items-start gap-2">
              <span className="mt-0.5 shrink-0 text-xs font-semibold text-gray-300">{idx + 1}</span>
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="text-sm font-semibold leading-snug text-gray-900">{j.headline}</span>
                  <span className={`inline-flex shrink-0 rounded px-1.5 py-0.5 text-meta font-medium ${INTENT_CHIP_CLS[j.intent]}`}>
                    {j.intentLabel}
                  </span>
                  {myCount(j) > 0 && (
                    <span className="inline-flex shrink-0 rounded bg-brand-50 px-1.5 py-0.5 text-meta font-medium text-brand-700">
                      自选 {myCount(j)} 只
                    </span>
                  )}
                </div>
                <p className="mt-1 text-sm leading-relaxed text-gray-600">
                  {j.body}
                  {j.splitNote && <span className="text-gray-800"> {j.splitNote}</span>}
                </p>
                {(j.changes?.length ?? 0) > 0 && (
                  <p className="mt-1 text-xs font-medium leading-relaxed text-indigo-700">
                    与昨日相比:{j.changes!.map((c) => c.text).join(" · ")}
                  </p>
                )}
                <p className="mt-1.5 text-sm leading-relaxed text-gray-800">
                  <span className="font-medium text-brand-700">我怎么看:</span>
                  {j.take}
                </p>
              </div>
            </div>
          </Link>
        ))}
      </div>
      {hadPrev && !anyChange && (
        <p className="mt-2 text-xs text-gray-500">与昨日相比,各链判断没有方向性变化。</p>
      )}
      <p className="mt-2 text-meta text-gray-400">
        由 事件×关系×资金意图×验证线索 规则合成,不构成投资建议 · 点卡片进链页看证据与反证
      </p>
    </section>
  );
}

export function JudgmentReview({ entries }: { entries: JudgmentReviewEntry[] }) {
  const aff = useWatchAffinity();
  if (entries.length === 0) return null; // 没有就不硬生成(负责人:不要为了有内容天天造一大段)
  const mine = (e: JudgmentReviewEntry) => (aff.segCount.get(e.segKey) ?? 0) > 0;
  const ordered = entries.slice().sort((a, b) => Number(mine(b)) - Number(mine(a)));
  return (
    <section className="mt-5">
      <h2 className="text-h2 font-semibold text-gray-900">旧判断复核</h2>
      <p className="mt-1 text-xs text-gray-400">
        之前的判断今天有没有被验证或需要重新看(资金行为层面;披露级验证在个股页验证点)
      </p>
      <div className="mt-3 space-y-2">
        {ordered.map((e, i) => (
          <div
            key={i}
            className={`rounded-xl border px-4 py-3 text-sm leading-relaxed ${
              e.tone === "confirm"
                ? "border-emerald-200 bg-emerald-50/60 text-emerald-900"
                : "border-amber-200 bg-amber-50/60 text-amber-900"
            }`}
          >
            {e.tone === "confirm" ? "✅ " : "⚠️ "}
            {mine(e) && (
              <span className="mr-1 inline-flex rounded bg-white/70 px-1.5 py-0.5 text-meta font-medium">
                含自选
              </span>
            )}
            {e.text}
          </div>
        ))}
      </div>
    </section>
  );
}
