"use client";

// 「和我相关」:你的票·ETF 一篮子。聚合自选 → 哪些 ETF 覆盖你最多自选(想分散参与你的方向时用),
// 展开看每个 ETF 具体覆盖了你哪几只。数据来自 /api/etf-coverage(读静态反查索引,极快)。
import { useEffect, useState } from "react";
import Link from "next/link";

interface Etf {
  code: string;
  name: string;
  stocks: { code: string; name: string; ratio: number }[];
}

export function EtfCoverage({ codes }: { codes: Set<string> }) {
  const [etfs, setEtfs] = useState<Etf[] | null>(null);
  const [open, setOpen] = useState(false);
  const codeKey = Array.from(codes).sort().join(",");

  useEffect(() => {
    if (!codeKey) return;
    let active = true;
    fetch("/api/etf-coverage", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ codes: codeKey.split(",") }),
    })
      .then((r) => r.json())
      .then((d) => active && setEtfs(d?.etfs ?? []))
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [codeKey]);

  if (!etfs || etfs.length === 0) return null;
  const top = etfs[0];

  return (
    <div className="overflow-hidden rounded-xl bg-white shadow-sm">
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center gap-2 px-4 py-3 text-left transition-colors hover:bg-gray-50"
      >
        <span className="text-sm font-medium text-gray-800">🧺 你的票·ETF 一篮子</span>
        <span className="rounded bg-brand-50 px-1.5 py-0.5 text-meta text-brand-600">
          {top.name} 覆盖 {top.stocks.length} 只
        </span>
        <span className="ml-auto inline-flex items-center gap-1 rounded-full bg-gray-100 px-2.5 py-1 text-xs font-medium text-gray-600">
          {open ? "收起" : "展开"}
          <span className="text-[10px]">{open ? "▲" : "▾"}</span>
        </span>
      </button>
      {open && (
        <div className="space-y-2.5 border-t border-gray-100 px-4 py-3">
          {etfs.map((e) => (
            <div key={e.code}>
              <div className="flex items-center gap-2">
                <span className="font-medium text-gray-800">{e.name}</span>
                <span className="font-mono text-xs text-gray-400">{e.code}</span>
                <span className="ml-auto text-xs text-gray-500">覆盖你 {e.stocks.length} 只</span>
              </div>
              <div className="mt-0.5 text-xs text-gray-500">
                {e.stocks.map((s, i) => (
                  <span key={s.code}>
                    {i > 0 && " · "}
                    <Link href={`/stock/${s.code}`} className="hover:text-brand-600">
                      {s.name}
                    </Link>
                    <span className="text-gray-400">{s.ratio}%</span>
                  </span>
                ))}
              </div>
            </div>
          ))}
          <p className="text-meta text-gray-300">
            想分散参与你的方向,可考虑覆盖度高的 ETF。基金季报持仓(Tushare),不构成投资建议。
          </p>
        </div>
      )}
    </div>
  );
}
