"use client";

// P2 AI链情绪仪表盘:首页顶部一条今日情绪(A股整体 + 隔夜美股),给个每天打开的理由。
import { useEffect, useState } from "react";
import { changeClass } from "@/lib/format";

interface A {
  up: number;
  down: number;
  flat: number;
  avgPct: number;
  netMfYi: number;
  covered: number;
}
interface US {
  up: number;
  down: number;
  avgPct: number;
  covered: number;
}
interface Data {
  date: string | null;
  a: A | null;
  us: US | null;
}

const fmtPct = (v: number) => `${v > 0 ? "+" : ""}${v.toFixed(2)}%`;
const fmtYi = (v: number) => `${v > 0 ? "+" : ""}${v.toFixed(1)}亿`;

export function ChainSentiment() {
  const [d, setD] = useState<Data | null>(null);
  useEffect(() => {
    let active = true;
    fetch("/api/chain-sentiment", { cache: "no-store" })
      .then((r) => r.json())
      .then((x) => active && setD(x))
      .catch(() => {});
    return () => {
      active = false;
    };
  }, []);

  if (!d || (!d.a && !d.us)) return null;
  const a = d.a;

  let mood: { t: string; c: string } | null = null;
  if (a) {
    const ratio = a.up / (a.up + a.down || 1);
    mood =
      ratio >= 0.6 && a.avgPct > 0
        ? { t: "偏强", c: "bg-rose-50 text-rose-600 ring-rose-600/20" }
        : ratio <= 0.4 && a.avgPct < 0
        ? { t: "偏弱", c: "bg-emerald-50 text-emerald-600 ring-emerald-600/20" }
        : { t: "中性", c: "bg-gray-100 text-gray-500 ring-gray-400/20" };
  }

  return (
    <div className="mb-4 rounded-xl border border-gray-200 bg-white px-4 py-3">
      <div className="mb-1.5 flex items-center gap-2">
        <span className="text-xs font-medium text-gray-600">
          📊 AI链今日情绪
        </span>
        {mood && (
          <span
            className={`rounded px-1.5 py-0.5 text-[11px] ring-1 ring-inset ${mood.c}`}
          >
            {mood.t}
          </span>
        )}
        {d.date && (
          <span className="ml-auto text-[11px] text-gray-400">
            {d.date.slice(5)}
          </span>
        )}
      </div>
      <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-gray-600">
        {a && (
          <span>
            A股 <span className="text-rose-600">涨{a.up}</span>/
            <span className="text-emerald-600">跌{a.down}</span> · 均{" "}
            <span className={changeClass(a.avgPct)}>{fmtPct(a.avgPct)}</span> ·
            主力 <span className={changeClass(a.netMfYi)}>{fmtYi(a.netMfYi)}</span>
          </span>
        )}
        {d.us && (
          <span>
            隔夜美股 <span className="text-rose-600">涨{d.us.up}</span>/
            <span className="text-emerald-600">跌{d.us.down}</span> · 均{" "}
            <span className={changeClass(d.us.avgPct)}>{fmtPct(d.us.avgPct)}</span>
          </span>
        )}
      </div>
    </div>
  );
}
