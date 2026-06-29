"use client";

// 板块 ETF:把 AI 产业链各主题映射到真实龙头 ETF,实时涨跌一眼看。
// 行情走 /api/etf-quotes(新浪),20s 轮询;ETF 单独成数据,不进个股关联模型。
import { useEffect, useState } from "react";
import { ETFS } from "@/data/etfs";
import { changeClass, fmtChange } from "@/lib/format";

interface Q {
  price: number;
  change: number;
}

export function EtfBoard() {
  const [quotes, setQuotes] = useState<Record<string, Q>>({});
  const [live, setLive] = useState(false);

  useEffect(() => {
    let active = true;
    async function load() {
      try {
        const r = await fetch("/api/etf-quotes", { cache: "no-store" });
        const d = await r.json();
        if (!active) return;
        setQuotes(d.quotes ?? {});
        setLive(Boolean(d.live));
      } catch {
        /* 静默 */
      }
    }
    load();
    const t = setInterval(load, 20000);
    return () => {
      active = false;
      clearInterval(t);
    };
  }, []);

  const covered = quotes && Object.keys(quotes).length;

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-gray-400">
          各板块主题对应的龙头 ETF(研究归并,规模为量级参考)。看不懂个股、想一篮子布局某个方向时用。
        </p>
        <div className="flex items-center gap-1.5 text-xs text-gray-400">
          <span
            className={`inline-block h-1.5 w-1.5 rounded-full ${
              live ? "bg-emerald-500" : "bg-gray-300"
            }`}
          />
          {live ? `行情已连接 · ${covered}/${ETFS.length}` : "行情未连接"}
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        {ETFS.map((e) => {
          const q = quotes[e.code];
          return (
            <div key={e.code} className="rounded-xl bg-white p-4 shadow-sm">
              <div className="flex items-baseline gap-2">
                <span className="font-semibold text-gray-900">{e.name}</span>
                <span className="font-mono text-xs text-gray-400">{e.code}</span>
                <span className="rounded bg-gray-100 px-1 py-0.5 text-[10px] font-medium text-gray-500">
                  {e.exchange}
                </span>
                <span
                  className={`ml-auto font-mono text-sm font-semibold tabular-nums ${
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

              <div className="mt-1 text-xs text-gray-500">
                {e.theme} · 跟踪 {e.tracksIndex} · 规模 ~{e.scaleYi}亿
              </div>

              <div className="mt-2 flex flex-wrap gap-1">
                {e.covers.map((c) => (
                  <span
                    key={c}
                    className="rounded bg-sky-50 px-1.5 py-0.5 text-[11px] text-sky-700"
                  >
                    {c}
                  </span>
                ))}
              </div>

              <p className="mt-2 text-[11px] leading-relaxed text-gray-400">{e.note}</p>
            </div>
          );
        })}
      </div>

      <p className="mt-3 text-xs text-gray-400">
        ETF 为研究归并的板块代理,覆盖关系/规模为量级参考,不构成投资建议。
      </p>
    </div>
  );
}
