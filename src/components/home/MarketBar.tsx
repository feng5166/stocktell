// 市场状态条(首页阅读路径改版 2026-08-14,server component)。
// 负责人:市场概览是背景不是主角——压成一条横向状态栏,一条解决;
// 隔夜事件雷达折叠进明细,不再单独占大模块。数据=已加载的情绪快照,零额外请求。
import Link from "next/link";
import { OvernightRadar } from "@/components/OvernightRadar";
import { ShareCardEntry } from "@/components/share/ShareCardEntry";
import { ChainHomeEntry } from "@/components/chain/ChainHomeEntry";
import type { ChainSentiment } from "@/lib/sentiment";
import type { SegIntentPair } from "@/components/home/HomeMyStocks";
import type { IntentType } from "@/lib/market-intent/types";
import { INTENT_CHIP_CLS } from "@/lib/market-intent/ui";

const pct = (v: number) => `${v > 0 ? "+" : ""}${v.toFixed(2)}%`;

// 三轮走查:家数用中性色,只有涨跌幅/主力净额带语义色——状态条是背景,不是一条红带子
function Cell({ k, v, tone }: { k: string; v: string; tone?: "up" | "down" }) {
  return (
    <span className="flex shrink-0 items-baseline gap-1.5">
      <span className="text-meta text-gray-400">{k}</span>
      <span
        className={`text-[13px] font-semibold ${
          tone === "up" ? "text-red-600" : tone === "down" ? "text-emerald-600" : "text-gray-800"
        }`}
      >
        {v}
      </span>
    </span>
  );
}

const INTENT_ORDER: IntentType[] = ["rush", "accumulation", "wash", "distribution", "exit", "divergence", "exhaustion", "neutral"];

export function MarketBar({
  data,
  relMap,
  segIntent,
}: {
  data: ChainSentiment | null | undefined;
  relMap: Record<string, string>;
  segIntent: Record<string, SegIntentPair>;
}) {
  const a = data?.a;
  const us = data?.us;
  if (!a && !us) return null;
  // 资金意图分布并入状态条(负责人方案 A:不单独占一整行)
  const counts = new Map<IntentType, number>();
  for (const k of Object.keys(segIntent)) {
    const t = segIntent[k].t.intent;
    counts.set(t, (counts.get(t) ?? 0) + 1);
  }
  return (
    <section className="mt-8">
      <div className="flex items-baseline justify-between">
        <h2 className="text-h2 font-semibold text-gray-900">市场状态</h2>
        <span className="text-meta text-gray-400">行情只是触发源,不代表产业链关系强弱</span>
      </div>
      <div className="mt-3 rounded-2xl bg-white px-4 py-3 shadow-sm">
        <div className="flex items-center gap-4 overflow-x-auto pb-0.5 sm:gap-5">
          {a && (
            <>
              <Cell k="上涨" v={String(a.up)} />
              <Cell k="下跌" v={String(a.down)} />
              <Cell k="平均" v={pct(a.avgPct)} tone={a.avgPct >= 0 ? "up" : "down"} />
              {a.netMfYi != null && (
                <Cell k="主力" v={`${a.netMfYi > 0 ? "+" : ""}${a.netMfYi.toFixed(1)}亿`} tone={a.netMfYi >= 0 ? "up" : "down"} />
              )}
            </>
          )}
          {us?.indices?.map((i) => (
            <Cell key={i.name} k={i.name} v={pct(i.change)} tone={i.change >= 0 ? "up" : "down"} />
          ))}
          <span className="ml-auto hidden shrink-0 items-center gap-3 sm:inline-flex">
            <ShareCardEntry />
            <ChainHomeEntry />
          </span>
        </div>
        {counts.size > 0 && (
          <div className="mt-2 flex items-center gap-2 overflow-x-auto border-t border-gray-100 pt-2">
            <span className="shrink-0 text-meta text-gray-400">板块意图({Object.keys(segIntent).length})</span>
            {INTENT_ORDER.filter((t) => (counts.get(t) ?? 0) > 0).map((t) => {
              const label = Object.values(segIntent).find((p) => p.t.intent === t)?.t.label ?? t;
              return (
                <span key={t} className={`inline-flex shrink-0 items-center gap-1 rounded px-1.5 py-0.5 text-meta font-medium ${INTENT_CHIP_CLS[t]}`}>
                  {label} {counts.get(t)}
                </span>
              );
            })}
            <Link href="/track" className="ml-auto shrink-0 text-meta font-medium text-brand-600 hover:underline">
              意图历史 →
            </Link>
          </div>
        )}
        {/* 隔夜事件雷达:并入明细折叠,不单独占模块 */}
        <details className="mt-2 border-t border-gray-100 pt-2">
          <summary className="cursor-pointer list-none text-xs font-medium text-brand-600 hover:underline">
            隔夜美股 × A 股联动明细 ▾
          </summary>
          <div className="mt-2">
            <OvernightRadar relMap={relMap} />
          </div>
        </details>
      </div>
    </section>
  );
}
