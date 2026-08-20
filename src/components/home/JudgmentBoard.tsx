"use client";

// 首屏「今日三条核心判断」+「验证进展(旧判断复核)」(2.2.5→首页视觉优化 2026-08-14)。
// 视觉规范:第一视觉中心=三条链卡(第一条「今日主线」强化);卡内一句人话结论(H3 级)
// + 四行轻量信息(资金/环节/映射/验证),不塞大段正文;Intent Badge 两层制(意图+小字置信度),
// 依据/反证/失效条件不进首页(Chain 页四段结构)。移动端:主线默认展开,2/3 折叠。
// 2.2.6 变化行保留;2.2.7 自选重排保留。
// 2026-08-18 色温/字体校准三件事:
//  ① 「与昨日」整行不再刷品牌紫——标签走灰,只有「今日新状态」带状态色(紫必须留给可点的东西);
//  ② 四行信息改成对齐的 label-value 两列,label 灰 / value 墨色,不再是一串同色小字;
//  ③ 主线卡标题 18px、结论 15px/500 行高 1.7,次卡各降一档——层级靠字号不靠加粗。
import Link from "next/link";
import type { ReactNode } from "react";
import type { ChainJudgment, ChainTrendPoint, JudgmentReviewEntry } from "@/lib/judgment";
import type { JudgmentChange } from "@/lib/judgment-diff";
import { INTENT_CHIP_CLS, fmtYmd } from "@/lib/market-intent/ui";
import type { IntentType } from "@/lib/market-intent/types";
import { useWatchAffinity } from "@/components/home/useWatchAffinity";

type Judged = ChainJudgment & { changes?: JudgmentChange[] };

// 微型资金趋势(主线大卡专属):链内板块主力净额合计,近 10 交易日的迷你柱。
// A 股口径:红=净流入,绿=净流出(与市场状态条「主力」、意图 chip 同一套口径)。
function FundSpark({ points }: { points: ChainTrendPoint[] }) {
  if (points.length < 4) return null;
  const W = 156;
  const H = 30;
  const gap = 3;
  const bw = (W - gap * (points.length - 1)) / points.length;
  const max = Math.max(...points.map((p) => Math.abs(p.v)), 0.1);
  const mid = H / 2;
  const last = points[points.length - 1];
  return (
    <span className="inline-flex flex-wrap items-center gap-2">
      <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} aria-hidden className="shrink-0">
        <line x1={0} y1={mid} x2={W} y2={mid} className="stroke-gray-200" strokeWidth={1} />
        {points.map((p, i) => {
          const h = Math.max((Math.abs(p.v) / max) * (mid - 2), 1.5);
          return (
            <rect
              key={p.ymd}
              x={i * (bw + gap)}
              y={p.v >= 0 ? mid - h : mid}
              width={bw}
              height={h}
              rx={1}
              className={p.v >= 0 ? "fill-red-300" : "fill-emerald-300"}
            />
          );
        })}
      </svg>
      <span className="text-meta tabular-nums text-gray-400">
        近{points.length}日主力净额 · 最新 {last.v > 0 ? "+" : ""}
        {last.v}亿
      </span>
    </span>
  );
}

// 短置信度(badge 第二层小字):较高/中等/低
const confShort = (c: string) => c.replace("置信度", "");

// 意图 → 文字状态色(A 股口径:红=资金进场,绿=资金流出,橙=需警惕,灰=无信息量)。
// 只用在「与昨日」的今日态上,一行最多一处彩色。
const INTENT_TEXT_CLS: Record<IntentType, string> = {
  accumulation: "text-red-600",
  rush: "text-red-700",
  wash: "text-amber-700",
  distribution: "text-emerald-700",
  exit: "text-emerald-800",
  divergence: "text-gray-900",
  exhaustion: "text-amber-800",
  neutral: "text-gray-900",
};

// 「与昨日」变化行:灰标签 + 灰旧态 → 带色新态。整句上色是上一版最刺眼的地方。
function ChangeLine({
  changes,
  intent,
  prefix,
}: {
  changes: JudgmentChange[];
  intent: IntentType;
  prefix: string;
}) {
  if (changes.length === 0) return null;
  return (
    <p className="mt-2 text-[13px] leading-relaxed text-gray-500">
      <span className="text-gray-400">{prefix}</span>
      {changes.map((c, i) => (
        <span key={i}>
          {i > 0 && <span className="text-gray-300"> · </span>}
          <span>{c.label}</span>
          {c.to && (
            <>
              {c.from && <span className="text-gray-400"> {c.from} →</span>}
              <span
                className={`font-medium ${
                  c.field === "intent" ? INTENT_TEXT_CLS[intent] : "text-gray-900"
                }`}
              >
                {" "}
                {c.to}
              </span>
            </>
          )}
        </span>
      ))}
    </p>
  );
}

// 四行信息 = 对齐的 label-value 两列(label 灰、value 墨色)。首页最需要"规整"的就是这块。
function InfoRow({ k, v }: { k: string; v: ReactNode }) {
  return (
    <div className="flex items-baseline gap-3 text-[13.5px] leading-[1.75]">
      <span className="w-10 shrink-0 text-[13px] text-gray-400">{k}</span>
      <span className="min-w-0 text-gray-800">{v}</span>
    </div>
  );
}

// 层级拉开(三轮走查):大卡=解释(变化行+事件/证据正文+四行信息+资金微趋势),小卡=判断
// (意图 badge 已并入标题行,正文只留一句 take)——小卡不再是缩小版完整卡。
function CardBody({ j, full, trend }: { j: Judged; full: boolean; trend?: ChainTrendPoint[] }) {
  const changes = j.changes ?? [];
  if (!full) {
    return (
      <>
        <ChangeLine changes={changes} intent={j.intent} prefix="与昨日:" />
        <div className="mt-2.5 text-right text-[13px] font-medium text-brand-600">查看详情 →</div>
      </>
    );
  }
  return (
    <>
      <ChangeLine changes={changes} intent={j.intent} prefix="与昨日相比:" />
      {j.body && <p className="mt-2 text-body text-gray-600">{j.body}</p>}
      <div className="mt-3 space-y-1 border-t border-gray-100 pt-3">
        <InfoRow
          k="资金"
          v={
            <>
              <span className={`inline-flex rounded px-1.5 py-0.5 text-meta font-medium ${INTENT_CHIP_CLS[j.intent]}`}>
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
        {trend && trend.length >= 4 && <InfoRow k="趋势" v={<FundSpark points={trend} />} />}
        {j.splitNote && (
          <p className="pt-1 text-[13px] leading-relaxed text-amber-700">{j.splitNote}</p>
        )}
      </div>
      <div className="mt-3 text-right text-[13px] font-medium text-brand-600">查看详情 →</div>
    </>
  );
}

export function JudgmentBoard({
  ymd,
  judgments,
  hadPrev = false,
  trends,
}: {
  ymd: string;
  judgments: Judged[];
  hadPrev?: boolean;
  trends?: Record<string, ChainTrendPoint[]>; // 链级资金微趋势(仅主线大卡渲染)
}) {
  const aff = useWatchAffinity();
  if (judgments.length === 0) return null;
  const myCount = (j: Judged) => aff.chainCount.get(j.chainSlug) ?? 0;
  const score = (j: Judged) =>
    j.rank + (j.changes?.length ?? 0) * 3 + Math.min(myCount(j), 3) * 2;
  const ordered = judgments.slice().sort((a, b) => score(b) - score(a));
  const top = ordered.slice(0, 3);
  const anyChange = judgments.some((j) => (j.changes?.length ?? 0) > 0);

  // 视觉优化(2026-08-16):去掉序号圆点与实色 chip——主次靠字号/卡片尺寸拉开,
  // 一卡最多「一个品牌色 chip + 一个状态色 chip」;逻辑标签降为中性灰。
  const Head = ({ j, idx, showIntent = false }: { j: Judged; idx: number; showIntent?: boolean }) => (
    <div className="min-w-0">
      <div className="flex flex-wrap items-center gap-1.5">
        {idx === 0 && (
          <span className="inline-flex rounded bg-brand-50 px-2 py-0.5 text-meta font-medium text-brand-700">
            今日主线
          </span>
        )}
        <span className={`font-semibold text-gray-900 ${idx === 0 ? "text-[18px]" : "text-[16px]"}`}>{j.chainName}</span>
        {j.logicLabel && (
          <span className="inline-flex rounded bg-gray-100 px-1.5 py-0.5 text-meta font-medium text-gray-500">
            {j.logicLabel}
          </span>
        )}
        {showIntent && (
          <span className={`inline-flex rounded px-1.5 py-0.5 text-meta font-medium ${INTENT_CHIP_CLS[j.intent]}`}>
            {j.intentLabel}
          </span>
        )}
        {myCount(j) > 0 && (
          <span className="inline-flex rounded bg-brand-50 px-1.5 py-0.5 text-meta font-medium text-brand-700">
            自选 {myCount(j)}
          </span>
        )}
      </div>
      {/* 核心判断:15px / 500 / 行高 1.7(次卡 14px)——扫读锚点,不加粗到 600 */}
      <p className={`mt-2 font-medium text-gray-900 ${idx === 0 ? "text-title" : "text-body"}`}>{j.take}</p>
    </div>
  );

  // 布局(2026-08-17 回单栏拍板):主线大卡全宽在上,次线 2 条并排一行在下——
  // 单栏流里仍然第一眼知道今天哪条最重要(靠尺寸与顺序,不靠左右分栏)。
  // 移动端:主线展开,次线折叠。
  const [main, ...rest] = top;
  return (
    <section className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-[1.65fr_0.8fr_0.8fr]">
      {/* 一级卡:白底 + 轻边框 + 极轻 shadow;主线卡边框带一丝品牌色,不用色块 */}
      <Link
        href={main.href}
        className="block rounded-[20px] bg-white p-5 shadow-[0_12px_34px_rgba(31,35,48,0.08)] transition hover:-translate-y-0.5 hover:shadow-[0_18px_42px_rgba(31,35,48,0.11)] sm:col-span-2 sm:p-6 lg:col-span-1"
      >
        <Head j={main} idx={0} />
        <CardBody j={main} full trend={trends?.[main.chainSlug]} />
      </Link>
      <div className="contents">
        {rest.map((j, i) => (
          <div key={j.chainSlug}>
            {/* 桌面:次卡=二级卡(边框更弱、无 shadow) */}
            <Link
              href={j.href}
              className="hidden h-full rounded-[20px] bg-white p-4 shadow-[0_12px_34px_rgba(31,35,48,0.07)] transition hover:-translate-y-0.5 hover:shadow-[0_18px_42px_rgba(31,35,48,0.1)] sm:block"
            >
              <Head j={j} idx={i + 1} showIntent />
              <CardBody j={j} full={false} />
            </Link>
            {/* 移动端:折叠 */}
            <details className="rounded-[18px] bg-white p-4 shadow-[0_10px_28px_rgba(31,35,48,0.07)] sm:hidden">
              <summary className="cursor-pointer list-none">
                <Head j={j} idx={i + 1} showIntent />
              </summary>
              <Link href={j.href} className="block">
                <CardBody j={j} full={false} />
              </Link>
            </details>
          </div>
        ))}
      </div>
      {hadPrev && !anyChange && (
        <p className="text-[13px] text-gray-500 sm:col-span-2 lg:col-span-3">与昨日相比,各链判断没有方向性变化。</p>
      )}
      <p className="text-meta leading-relaxed text-gray-400 sm:col-span-2 lg:col-span-3">
        由 事件×关系×资金意图×验证线索 规则合成,不构成投资建议 · 依据与反证在链页 · {fmtYmd(ymd)} 盘后
      </p>
    </section>
  );
}

// 验证进展的对错标记:原来用 ✅ emoji,那是一块饱和的绿——而绿在本站已经被
// 「资金流出」占用,拿它表示「判断兑现」直接和状态色打架。改成中性 ✓(兑现,不喧哗)
// + 琥珀 ⚠(出现反证,才是要人停下来看的那条)。
const REVIEW_STATE: Record<JudgmentReviewEntry["tone"], { mark: string; cls: string }> = {
  confirm: { mark: "✓", cls: "text-gray-400" },
  warn: { mark: "⚠", cls: "text-amber-600" },
};

export function JudgmentReview({ entries }: { entries: JudgmentReviewEntry[] }) {
  const aff = useWatchAffinity();
  if (entries.length === 0) return null; // 没有就不硬生成(负责人:不要为了有内容天天造一大段)
  const mine = (e: JudgmentReviewEntry) => (aff.segCount.get(e.segKey) ?? 0) > 0;
  const ordered = entries.slice().sort((a, b) => Number(mine(b)) - Number(mine(a)));
  return (
    <section className="mt-8">
      <h2 className="text-h2 font-semibold text-gray-900">验证进展</h2>
      <p className="mt-1.5 text-meta text-gray-400">
        之前的判断今天怎么样了——只列最近发生变化的,长期无变化不展示
      </p>
      {/* 信息条(非卡片):轻边框白条,不做 shadow */}
      <div className="mt-3 space-y-2">
        {ordered.map((e, i) => (
          <div key={i} className="flex items-start gap-2 rounded-lg border border-gray-200 bg-white px-4 py-2.5 text-body">
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
