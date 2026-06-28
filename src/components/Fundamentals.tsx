"use client";

import { useEffect, useState } from "react";

interface Fundamental {
  tradeDate: string;
  peTtm: number | null;
  pb: number | null;
  totalMvYi: number | null;
  circMvYi: number | null;
  turnover: number | null;
}

// A 股基本面(Tushare 真值)。仅 A 股展示;拿不到则不渲染。
export function Fundamentals({ code, market }: { code: string; market: string }) {
  const [f, setF] = useState<Fundamental | null>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    if (market !== "A股") {
      setLoaded(true);
      return;
    }
    fetch(`/api/fundamentals?code=${code}`, { cache: "no-store" })
      .then((r) => r.json())
      .then((d) => setF(d.fundamental ?? null))
      .catch(() => {})
      .finally(() => setLoaded(true));
  }, [code, market]);

  if (market !== "A股" || !loaded || !f) return null;

  const fmt = (v: number | null, suffix = "") =>
    v === null ? "—" : `${v}${suffix}`;
  const mv = (v: number | null) =>
    v === null ? "—" : v >= 10000 ? `${(v / 10000).toFixed(2)}万亿` : `${Math.round(v)}亿`;

  return (
    <section className="mb-4 rounded-xl bg-white shadow-sm p-4">
      <h2 className="mb-2 text-xs font-medium uppercase tracking-wide text-gray-400">
        基本面(真实数据)
      </h2>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Cell label="市盈率 TTM" value={fmt(f.peTtm)} />
        <Cell label="市净率 PB" value={fmt(f.pb)} />
        <Cell label="总市值" value={mv(f.totalMvYi)} />
        <Cell label="换手率" value={fmt(f.turnover, "%")} />
      </div>
      <p className="mt-2 text-[11px] text-gray-300">
        数据 Tushare · {f.tradeDate} 收盘
      </p>
    </section>
  );
}

function Cell({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-gray-50 px-3 py-2">
      <div className="text-xs text-gray-400">{label}</div>
      <div className="mt-0.5 font-mono text-sm font-semibold tabular-nums text-gray-800">
        {value}
      </div>
    </div>
  );
}
