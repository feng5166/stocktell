"use client";

// 「和我相关」今日无相关动态时的轻量持仓概览:涨跌分布 + 最强/最弱,一行不堆模块。
// 让用户即便"今天没事"也有一眼可看的内容,不至于空洞。
import { useEffect, useState } from "react";
import Link from "next/link";
import { STOCK_MAP } from "@/data/stocks";

interface Quote {
  price: number;
  change: number; // 日涨跌 %
}

export function WatchOverview({ codes }: { codes: Set<string> }) {
  const [quotes, setQuotes] = useState<Record<string, Quote> | null>(null);
  const [live, setLive] = useState(true);

  useEffect(() => {
    let active = true;
    fetch("/api/quotes", { cache: "no-store" })
      .then((r) => r.json())
      .then((d) => {
        if (!active) return;
        setQuotes(d.quotes ?? {});
        setLive(Boolean(d.live));
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, []);

  if (!quotes) return null;
  const items = Array.from(codes)
    .map((c) => ({ code: c, name: STOCK_MAP[c]?.name ?? c, change: quotes[c]?.change }))
    .filter((x): x is { code: string; name: string; change: number } => typeof x.change === "number");
  if (items.length === 0) return null;

  const up = items.filter((x) => x.change > 0).length;
  const down = items.filter((x) => x.change < 0).length;
  const flat = items.length - up - down;
  const sorted = [...items].sort((a, b) => b.change - a.change);
  const best = sorted[0];
  const worst = sorted[sorted.length - 1];
  const pct = (v: number) => `${v >= 0 ? "+" : ""}${v.toFixed(1)}%`;
  const cls = (v: number) =>
    v > 0 ? "text-rose-600" : v < 0 ? "text-emerald-600" : "text-gray-400";

  return (
    <div className="rounded-xl bg-white px-4 py-3 text-sm leading-relaxed">
      <span className="text-gray-700">你的 {items.length} 只今天 </span>
      <span className="text-rose-600">涨 {up}</span>
      <span className="text-gray-300"> · </span>
      <span className="text-emerald-600">跌 {down}</span>
      {flat > 0 && <span className="text-gray-400"> · 平 {flat}</span>}
      {best && best.change > 0 && (
        <>
          <span className="text-gray-300"> · </span>
          最强{" "}
          <Link href={`/stock/${best.code}`} className="font-medium text-gray-800 hover:underline">
            {best.name}
          </Link>{" "}
          <span className={cls(best.change)}>{pct(best.change)}</span>
        </>
      )}
      {worst && worst.change < 0 && worst.code !== best.code && (
        <>
          <span className="text-gray-300"> · </span>
          最弱{" "}
          <Link href={`/stock/${worst.code}`} className="font-medium text-gray-800 hover:underline">
            {worst.name}
          </Link>{" "}
          <span className={cls(worst.change)}>{pct(worst.change)}</span>
        </>
      )}
      {!live && <span className="ml-1 text-xs text-gray-400">(休市/缓存行情)</span>}
    </div>
  );
}
