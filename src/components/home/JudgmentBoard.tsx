"use client";

// 首屏「今日三条核心判断」+「验证进展(旧判断复核)」(2.2.5→首页视觉优化 2026-08-14)。
// 视觉规范:第一视觉中心=三条链卡(第一条「今日主线」强化);卡内一句人话结论(H3 级)
// + 四行轻量信息(资金/环节/映射/验证),不塞大段正文;Intent Badge 两层制(意图+小字置信度),
// 依据/反证/失效条件不进首页(Chain 页四段结构)。移动端:主线默认展开,2/3 折叠。
// 2.2.6 变化行保留;2.2.7 自选重排保留。
import Link from "next/link";
import type { ReactNode } from "react";
import type { ChainJudgment, JudgmentReviewEntry } from "@/lib/judgment";
import type { JudgmentChange } from "@/lib/judgment-diff";
import { INTENT_CHIP_CLS, fmtYmd } from "@/lib/market-intent/ui";
import { useWatchAffinity } from "@/components/home/useWatchAffinity";

type Judged = ChainJudgment & { changes?: JudgmentChange[] };

// 短置信度(badge 第二层小字):较高/中等/低
const confShort = (c: string) => c.replace("置信度", "");

function InfoRow({ k, v }: { k: string; v: ReactNode }) {
  return (
    <div className="flex items-baseline gap-2 text-[13px] leading-relaxed">
      <span className="w-9 shrink-0 text-meta text-gray-400">{k}</span>
      <span className="min-w-0 text-gray-700">{v}</span>
    </div>
  );
}

function CardBody({ j, full }: { j: Judged; full: boolean }) {
  return (
    <>
      {(j.changes?.length ?? 0) > 0 && (
        <p className="mt-1.5 text-xs font-medium leading-relaxed text-indigo-700">
          与昨日相比:{j.changes!.map((c) => c.text).join(" · ")}
        </p>
      )}
      {full && (
        <div className="mt-2.5 space-y-1 border-t border-gray-100 pt-2.5">
          <InfoRow
            k="资金"
            v={
              <>
                <span className={`inline-flex rounded px-1.5 py-0.5 text-xs font-medium ${INTENT_CHIP_CLS[j.intent]}`}>
                  {j.intentLabel}
                </span>
                <span className="ml-1.5 text-meta text-gray-400">{confShort(j.confidence)}</span>
              </>
            }
          />
          {j.coreSegments && j.coreSegments.length > 0 && (
            <InfoRow k="环节" v={j.coreSegments.join(" · ")} />
          )}
          {j.repStocks && j.repStocks.length > 0 && (
            <InfoRow k="映射" v={j.repStocks.join(" · ")} />
          )}
          {j.verifyHint && <InfoRow k="验证" v={j.verifyHint} />}
          {j.splitNote && (
            <p className="pt-0.5 text-xs leading-relaxed text-amber-700">{j.splitNote}</p>
          )}
        </div>
      )}
      <div className="mt-2.5 text-right text-xs font-medium text-brand-600">查看详情 →</div>
    </>
  );
}

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

  const Head = ({ j, idx }: { j: Judged; idx: number }) => (
    <div className="min-w-0">
      <div className="flex flex-wrap items-center gap-1.5">
        <span
          className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold ${
            idx === 0 ? "bg-brand-600 text-white" : "bg-gray-100 text-gray-500"
          }`}
        >
          {idx + 1}
        </span>
        <span className="text-[15px] font-semibold text-gray-900">{j.chainName}</span>
        {j.logicLabel && (
          <span className="inline-flex rounded bg-brand-50 px-1.5 py-0.5 text-meta font-medium text-brand-700">
            {j.logicLabel}
          </span>
        )}
        {idx === 0 && (
          <span className="inline-flex rounded bg-brand-600 px-1.5 py-0.5 text-meta font-medium text-white">
            今日主线
          </span>
        )}
        {myCount(j) > 0 && (
          <span className="inline-flex rounded bg-brand-50 px-1.5 py-0.5 text-meta font-medium text-brand-700">
            自选 {myCount(j)}
          </span>
        )}
      </div>
      <p className="mt-1.5 text-sm font-medium leading-relaxed text-gray-800">{j.take}</p>
    </div>
  );

  return (
    <section className="mt-6">
      <div className="flex items-baseline justify-between">
        <h2 className="text-h2 font-semibold text-gray-900">今日核心判断</h2>
        <span className="text-meta text-gray-400">{fmtYmd(ymd)} 盘后合成</span>
      </div>
      <div className="mt-3 grid gap-3 md:grid-cols-3">
        {top.map((j, idx) => (
          <div key={j.chainSlug} className={idx === 0 ? "" : "hidden sm:block"}>
            <Link
              href={j.href}
              className={`block h-full rounded-2xl bg-white p-5 shadow-sm transition-shadow hover:shadow ${
                idx === 0 ? "ring-1 ring-brand-200" : ""
              }`}
            >
              <Head j={j} idx={idx} />
              <CardBody j={j} full />
            </Link>
          </div>
        ))}
        {/* 移动端:2/3 折叠(主线默认展开在上方) */}
        {top.slice(1).map((j, i) => (
          <details key={`m-${j.chainSlug}`} className="rounded-2xl bg-white p-4 shadow-sm sm:hidden">
            <summary className="cursor-pointer list-none">
              <Head j={j} idx={i + 1} />
            </summary>
            <Link href={j.href} className="block">
              <CardBody j={j} full />
            </Link>
          </details>
        ))}
      </div>
      {hadPrev && !anyChange && (
        <p className="mt-2 text-xs text-gray-500">与昨日相比,各链判断没有方向性变化。</p>
      )}
      <p className="mt-2 text-meta text-gray-400">
        由 事件×关系×资金意图×验证线索 规则合成,不构成投资建议 · 依据与反证在链页
      </p>
    </section>
  );
}

const REVIEW_STATE: Record<JudgmentReviewEntry["tone"], { mark: string; cls: string }> = {
  confirm: { mark: "✅", cls: "text-emerald-700" },
  warn: { mark: "⚠", cls: "text-amber-700" },
};

export function JudgmentReview({ entries }: { entries: JudgmentReviewEntry[] }) {
  const aff = useWatchAffinity();
  if (entries.length === 0) return null; // 没有就不硬生成(负责人:不要为了有内容天天造一大段)
  const mine = (e: JudgmentReviewEntry) => (aff.segCount.get(e.segKey) ?? 0) > 0;
  const ordered = entries.slice().sort((a, b) => Number(mine(b)) - Number(mine(a)));
  return (
    <section className="mt-8">
      <h2 className="text-h2 font-semibold text-gray-900">验证进展</h2>
      <p className="mt-1 text-meta text-gray-400">
        之前的判断今天怎么样了——只列最近发生变化的,长期无变化不展示
      </p>
      <div className="mt-3 space-y-2">
        {ordered.map((e, i) => (
          <div key={i} className="flex items-start gap-2 rounded-xl bg-white px-4 py-3 text-sm leading-relaxed shadow-sm">
            <span className={`shrink-0 ${REVIEW_STATE[e.tone].cls}`}>{REVIEW_STATE[e.tone].mark}</span>
            <span className="min-w-0 text-gray-700">
              {mine(e) && (
                <span className="mr-1.5 inline-flex rounded bg-brand-50 px-1.5 py-0.5 text-meta font-medium text-brand-700">
                  含自选
                </span>
              )}
              {e.text}
            </span>
          </div>
        ))}
      </div>
    </section>
  );
}
