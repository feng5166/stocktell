"use client";

// 首页「和我相关」冷启动:还没自选时,直接在这儿搜票加自选,不用跳去股票池。
// 复用调用方传入的 useWatchlist 实例(同一份状态),加完即时反映到「和我相关」。
import { useMemo, useState } from "react";
import Link from "next/link";
import { STOCKS } from "@/data/stocks";
import type { UseWatchlist } from "@/components/useWatchlist";

// 覆盖口径:对 A股 散户只强调可交易的 A股 只数,美股是用来联动的"锚点"(单列说明,不混入只数)
const A_SHARE_COUNT = STOCKS.filter((s) => s.market === "A股").length;

export function QuickAddWatch({ wl }: { wl: UseWatchlist }) {
  const [q, setQ] = useState("");

  const matches = useMemo(() => {
    const kw = q.trim().toLowerCase();
    if (!kw) return [];
    return STOCKS.filter(
      (s) =>
        s.code.toLowerCase().includes(kw) || s.name.toLowerCase().includes(kw)
    ).slice(0, 8);
  }, [q]);

  return (
    <div className="rounded-xl border border-brand-100 bg-white p-3 sm:p-4">
      <div className="text-sm font-medium text-gray-800">
        先告诉我你拿哪些票 👇
      </div>
      <div className="mt-1 text-xs text-gray-500">
        搜代码或名称加自选,以后这儿只给你看跟你票相关的动态。
      </div>

      <input
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="如 中际旭创 / 300308 / 英伟达"
        className="mt-3 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-brand-400 focus:outline-none"
      />

      {q.trim() && (
        <div className="mt-2 divide-y divide-gray-100 overflow-hidden rounded-lg border border-gray-100">
          {matches.length === 0 ? (
            <div className="px-3 py-3 text-center text-xs leading-relaxed text-gray-500">
              {/^\d{6}$/.test(q.trim())
                ? `「${q.trim()}」暂未纳入。`
                : `没找到「${q.trim()}」。`}
              StockTell 目前专盯 AI 产业链(覆盖 A 股约 {A_SHARE_COUNT} 只 + 美股锚点),其它板块还在路上——换 AI 链上的票试试。
            </div>
          ) : (
            matches.map((s) => {
              const added = wl.has(s.code);
              return (
                <div
                  key={s.code}
                  className="flex items-center gap-2 px-3 py-2"
                >
                  <Link
                    href={`/stock/${s.code}`}
                    className="min-w-0 flex-1 hover:opacity-80"
                  >
                    <span className="text-sm font-medium text-gray-800">
                      {s.name}
                    </span>
                    <span className="ml-2 font-mono text-xs text-gray-400">
                      {s.code}
                    </span>
                    <span
                      className={`ml-2 rounded px-1 py-0.5 text-[10px] ${
                        s.market === "美股"
                          ? "bg-brand-50 text-brand-600"
                          : "bg-red-50 text-red-600"
                      }`}
                    >
                      {s.market}
                    </span>
                  </Link>
                  <button
                    onClick={() => wl.toggle(s.code)}
                    className={`shrink-0 rounded-lg px-3 py-1.5 text-xs font-medium ${
                      added
                        ? "border border-gray-300 text-gray-500 hover:bg-gray-100"
                        : "bg-brand-600 text-white hover:bg-brand-700"
                    }`}
                  >
                    {added ? "✓ 已加" : "+ 加自选"}
                  </button>
                </div>
              );
            })
          )}
        </div>
      )}

      <div className="mt-2 text-xs text-gray-400">
        想浏览全部?去{" "}
        <Link href="/stocks" className="text-brand-600 hover:underline">
          股票池
        </Link>
        。
      </div>
    </div>
  );
}
