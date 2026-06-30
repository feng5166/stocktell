"use client";

import { useEffect, useState } from "react";
import { InfoHint } from "@/components/InfoHint";

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
      <Metric
        label="市盈率TTM"
        value={fmt(f.peTtm)}
        hint="市盈率=股价相对每股盈利的倍数;越高说明市场预期越乐观,也越贵"
      />
      <Metric
        label="PB"
        value={fmt(f.pb)}
        hint="市净率=股价相对每股净资产的倍数;越低相对越'便宜'(但要结合行业看)"
      />
      <Metric label="总市值" value={mv(f.totalMvYi)} hint="公司总价值=股价 × 总股本" />
      <Metric
        label="换手"
        value={fmt(f.turnover, "%")}
        hint="换手率=当天成交量占流通股的比例;越高交投越活跃、也越偏投机"
      />
      <span className="text-gray-300">· Tushare {f.tradeDate} 收盘</span>
    </div>
  );
}

function Metric({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint?: string;
}) {
  return (
    <span className="inline-flex items-center">
      {label}
      {hint ? <InfoHint text={hint} className="mx-0.5" /> : null}{" "}
      <b className="font-mono font-semibold tabular-nums text-gray-800">{value}</b>
    </span>
  );
}
