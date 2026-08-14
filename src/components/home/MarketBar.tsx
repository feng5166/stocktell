// 市场状态条(首页阅读路径改版 2026-08-14,server component)。
// 负责人:市场概览是背景不是主角——压成一条横向状态栏,一条解决;
// 隔夜事件雷达折叠进明细,不再单独占大模块。数据=已加载的情绪快照,零额外请求。
import { OvernightRadar } from "@/components/OvernightRadar";
import { ShareCardEntry } from "@/components/share/ShareCardEntry";
import { ChainHomeEntry } from "@/components/chain/ChainHomeEntry";
import type { ChainSentiment } from "@/lib/sentiment";

const pct = (v: number) => `${v > 0 ? "+" : ""}${v.toFixed(2)}%`;

function Cell({ k, v, tone }: { k: string; v: string; tone?: "up" | "down" }) {
  return (
    <span className="flex shrink-0 items-baseline gap-1.5">
      <span className="text-meta text-gray-400">{k}</span>
      <span
        className={`text-sm font-semibold ${
          tone === "up" ? "text-red-600" : tone === "down" ? "text-emerald-600" : "text-gray-800"
        }`}
      >
        {v}
      </span>
    </span>
  );
}

export function MarketBar({
  data,
  relMap,
}: {
  data: ChainSentiment | null | undefined;
  relMap: Record<string, string>;
}) {
  const a = data?.a;
  const us = data?.us;
  if (!a && !us) return null;
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
              <Cell k="上涨" v={String(a.up)} tone="up" />
              <Cell k="下跌" v={String(a.down)} tone="down" />
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
