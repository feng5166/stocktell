"use client";

// 「和我相关」顶部:你的自选有哪些雷区事件(解禁/增减持/质押/ST/回购)。
// 默认折叠成一条徽标,点开看明细。数据来自 /api/risk-events(按天缓存)。
import { useEffect, useState } from "react";
import Link from "next/link";
import { STOCK_MAP } from "@/data/stocks";

interface RiskEvent {
  kind: string;
  severity: "high" | "mid" | "info";
  text: string;
}

export function RiskSummary({ codes }: { codes: Set<string> }) {
  const [byCode, setByCode] = useState<Record<string, RiskEvent[]>>({});
  const [open, setOpen] = useState(false);
  const codeKey = Array.from(codes).sort().join(",");

  useEffect(() => {
    if (!codeKey) return;
    let active = true;
    fetch("/api/risk-events", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ codes: codeKey.split(",") }),
    })
      .then((r) => r.json())
      .then((d) => {
        if (active && d?.byCode) setByCode(d.byCode);
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [codeKey]);

  const stocks = Object.keys(byCode);
  const total = stocks.reduce((n, c) => n + byCode[c].length, 0);
  const hasHigh = stocks.some((c) => byCode[c].some((e) => e.severity === "high"));
  if (total === 0) return null;

  return (
    <div className="overflow-hidden rounded-xl bg-white shadow-sm">
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center gap-2 px-4 py-3 text-left transition-colors hover:bg-gray-50"
      >
        <span className="text-sm font-medium text-gray-800">⚠️ 你的票·雷区</span>
        <span
          className={`rounded px-1.5 py-0.5 text-meta ${
            hasHigh ? "bg-rose-50 text-rose-600" : "bg-amber-50 text-amber-700"
          }`}
        >
          {total} 个事件
        </span>
        <span className="ml-auto inline-flex items-center gap-1 rounded-full bg-gray-100 px-2.5 py-1 text-xs font-medium text-gray-600">
          {open ? "收起" : "展开"}
          <span className="text-[10px]">{open ? "▲" : "▾"}</span>
        </span>
      </button>
      {open && (
        <div className="space-y-2.5 border-t border-gray-100 px-4 py-3">
          {stocks.map((c) => (
            <div key={c}>
              <Link
                href={`/stock/${c}`}
                className="text-sm font-medium text-gray-800 hover:text-brand-600"
              >
                {STOCK_MAP[c]?.name ?? c}
              </Link>
              <ul className="mt-1 space-y-1">
                {byCode[c].map((e, i) => (
                  <li
                    key={i}
                    className={`text-xs ${
                      e.severity === "high"
                        ? "text-rose-600"
                        : e.severity === "info"
                        ? "text-gray-500"
                        : "text-amber-700"
                    }`}
                  >
                    {e.text}
                  </li>
                ))}
              </ul>
            </div>
          ))}
          <p className="text-meta text-gray-300">公开信息整理,提示风险,不构成投资建议。</p>
        </div>
      )}
    </div>
  );
}
