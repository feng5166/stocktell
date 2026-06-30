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

  // 紧凑内联行:并入标题区,不再单拉卡片模块
  return (
    <div className="mb-4 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-gray-500">
      <Metric label="市盈率TTM" value={fmt(f.peTtm)} />
      <Metric label="PB" value={fmt(f.pb)} />
      <Metric label="总市值" value={mv(f.totalMvYi)} />
      <Metric label="换手" value={fmt(f.turnover, "%")} />
      <span className="text-gray-300">· Tushare {f.tradeDate} 收盘</span>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <span>
      {label}{" "}
      <b className="font-mono font-semibold tabular-nums text-gray-800">{value}</b>
    </span>
  );
}
