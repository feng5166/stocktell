"use client";

// 「股票列表」顶部的相关板块 ETF 条:把自选的 / 搜索命中的 / 当前板块的 ETF 就近露出来,
// 让用户能在个股列表里搜到 ETF、自选后也出现在这。ETF 用自然格式(名称/涨跌/主题),
// 不硬塞进个股研究表的列。星标与个股共用同一套自选(传入同一个 wl 实例,两处同步)。
import type { Etf } from "@/data/etfs";
import type { UseWatchlist } from "@/components/useWatchlist";
import { changeClass, fmtChange } from "@/lib/format";

interface Q {
  price: number;
  change: number;
}

export function EtfStrip({
  etfs,
  quotes,
  wl,
}: {
  etfs: Etf[];
  quotes: Record<string, Q>;
  wl: UseWatchlist;
}) {
  if (etfs.length === 0) return null;
  return (
    <div className="mb-3 rounded-xl bg-white p-3 shadow-sm">
      <div className="mb-2 flex items-center gap-2">
        <span className="text-xs font-medium text-gray-600">相关板块 ETF</span>
        <span className="text-[11px] text-gray-400">想一篮子布局该方向时用</span>
      </div>
      <div className="space-y-1">
        {etfs.map((e) => {
          const q = quotes[e.code];
          const on = wl.has(e.code);
          return (
            <div
              key={e.code}
              className="flex items-center gap-2 rounded-md px-1 py-1 text-sm hover:bg-gray-50"
            >
              <button
                onClick={() => wl.toggle(e.code)}
                title={on ? "取消自选" : "加自选"}
                aria-label={on ? "取消自选" : "加自选"}
                className={`-m-2 inline-flex h-10 w-10 shrink-0 items-center justify-center text-base leading-none transition-colors ${
                  on ? "text-amber-500" : "text-gray-300 hover:text-amber-400"
                }`}
              >
                {on ? "★" : "☆"}
              </button>

              <span className="font-medium text-gray-900">{e.name}</span>
              <span className="font-mono text-xs text-gray-400">{e.code}</span>
              <span className="rounded bg-sky-50 px-1 py-0.5 text-[10px] font-medium text-sky-600">
                ETF
              </span>
              <span className="hidden text-xs text-gray-400 sm:inline">
                · {e.theme}
              </span>

              <span
                className={`ml-auto shrink-0 font-mono text-sm font-semibold tabular-nums ${
                  q ? changeClass(q.change) : "text-gray-300"
                }`}
              >
                {q ? (
                  <>
                    {q.price.toFixed(3)}{" "}
                    <span className="text-xs">{fmtChange(q.change)}</span>
                  </>
                ) : (
                  "—"
                )}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
