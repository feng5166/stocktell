"use client";

// 「相关 ETF · 一篮子参与」:点某只 ETF 弹站内框看行情+本股占比,不再直接跳出去东方财富
//(东方财富降级为弹框里可选的"看详情"外链)。数据:ETF_HOLDINGS(code/name/本股占比)+ 实时行情。
import { useEffect, useState } from "react";
import { useLockBodyScroll } from "@/lib/useLockBodyScroll";

interface Holding {
  code: string;
  name: string;
  ratio: number;
}

export function EtfPeek({
  etfs,
  stockName,
}: {
  etfs: Holding[];
  stockName: string;
}) {
  const [open, setOpen] = useState<Holding | null>(null);
  return (
    <>
      <div className="space-y-1 text-sm">
        {etfs.map((e) => (
          <button
            key={e.code}
            onClick={() => setOpen(e)}
            className="-mx-2 flex min-h-[44px] w-full flex-wrap items-center gap-2 rounded-lg px-2 py-1.5 text-left transition-colors hover:bg-brand-50/60 active:bg-brand-50/60 sm:min-h-0"
          >
            <span className="font-mono text-xs text-gray-400">{e.code}</span>
            <span className="font-medium text-gray-800">{e.name}</span>
            <span className="ml-auto text-xs text-gray-500">
              {stockName}占 <b className="font-medium text-gray-700">{e.ratio}%</b>
            </span>
          </button>
        ))}
      </div>
      {open && (
        <EtfModal holding={open} stockName={stockName} onClose={() => setOpen(null)} />
      )}
    </>
  );
}

function EtfModal({
  holding,
  stockName,
  onClose,
}: {
  holding: Holding;
  stockName: string;
  onClose: () => void;
}) {
  useLockBodyScroll();
  const [q, setQ] = useState<{ price: number; change: number } | null>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let active = true;
    fetch(`/api/etf-quotes?symbols=${holding.code}`, { cache: "no-store" })
      .then((r) => r.json())
      .then((d) => {
        if (!active) return;
        setQ(d?.quotes?.[holding.code] ?? null);
        setLoaded(true);
      })
      .catch(() => active && setLoaded(true));
    return () => {
      active = false;
    };
  }, [holding.code]);

  const ext = `https://quote.eastmoney.com/${
    holding.code.startsWith("5") ? "sh" : "sz"
  }${holding.code}.html`;
  const cls =
    q && q.change > 0
      ? "text-rose-600"
      : q && q.change < 0
      ? "text-emerald-600"
      : "text-gray-500";

  return (
    <div
      className="fixed inset-0 z-[80] flex items-end justify-center bg-black/40 p-0 sm:items-center sm:p-4"
      onClick={onClose}
    >
      <div
        className="max-h-[90dvh] w-full max-w-sm overflow-y-auto overscroll-contain rounded-t-2xl bg-white p-5 pb-[calc(1.25rem+env(safe-area-inset-bottom,0px))] shadow-xl sm:rounded-2xl sm:pb-5"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-1 flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h3 className="text-base font-semibold text-gray-900">{holding.name}</h3>
            <div className="mt-0.5 font-mono text-xs text-gray-400">{holding.code}</div>
          </div>
          <button
            onClick={onClose}
            aria-label="关闭"
            className="-m-2 inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-gray-500 hover:bg-gray-100 hover:text-gray-700"
          >
            ✕
          </button>
        </div>

        {/* 实时行情 */}
        <div className="mt-2 flex items-baseline gap-2">
          {!loaded ? (
            <span className="text-sm leading-8 text-gray-300">行情加载中…</span>
          ) : q ? (
            <>
              <span className={`font-mono text-2xl font-semibold tabular-nums ${cls}`}>
                {q.price.toFixed(3)}
              </span>
              <span className={`text-sm font-medium ${cls}`}>
                {q.change > 0 ? "+" : ""}
                {q.change.toFixed(2)}%
              </span>
            </>
          ) : (
            <span className="text-sm leading-8 text-gray-500">休市 / 暂无行情</span>
          )}
        </div>

        {/* 本股占比 + 说明 */}
        <p className="mt-3 text-sm leading-relaxed text-gray-700">
          在这只 ETF 里,<b className="font-medium">{stockName}</b> 约占{" "}
          <b className="font-medium text-brand-600">{holding.ratio}%</b>(基金季报持仓)。
        </p>
        <p className="mt-1 text-xs leading-relaxed text-gray-500">
          看好这个方向又不想押单只,可用它一篮子参与。占比来自基金季报,不构成投资建议。
        </p>

        {/* 东方财富:降级为可选外链,不再默认跳出 */}
        <a
          href={ext}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-4 inline-flex min-h-[40px] items-center gap-1 rounded-lg bg-gray-100 px-3.5 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-200 active:bg-gray-200"
        >
          去东方财富看详情 ↗
        </a>
      </div>
    </div>
  );
}
