"use client";

// 「和我相关」:你的票·财报体检(一句话看懂)。懒加载——财报每只票多个 Tushare 调用,
// 默认折叠,点开才拉 /api/fin-checkup(已按天缓存),不拖慢首页。
import { useState } from "react";
import Link from "next/link";
import { STOCK_MAP } from "@/data/stocks";

interface Finding {
  text: string;
  severity: "high" | "mid" | "good" | "info";
}
interface Checkup {
  year: string;
  reportLabel?: string; // 如 "2025 三季报";旧缓存可能没有,回退用 year
  findings: Finding[];
}

const COLOR: Record<string, string> = {
  high: "text-rose-600",
  mid: "text-amber-700",
  good: "text-emerald-600",
  info: "text-gray-500",
};

export function FinSummary({ codes }: { codes: Set<string> }) {
  const [open, setOpen] = useState(false);
  const [byCode, setByCode] = useState<Record<string, Checkup> | null>(null);
  const [loading, setLoading] = useState(false);

  async function expand() {
    setOpen((o) => !o);
    if (byCode || loading) return;
    setLoading(true);
    try {
      const r = await fetch("/api/fin-checkup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ codes: Array.from(codes) }),
      }).then((x) => x.json());
      setByCode(r?.byCode ?? {});
    } catch {
      setByCode({});
    } finally {
      setLoading(false);
    }
  }

  const stocks = byCode ? Object.keys(byCode) : [];

  return (
    <div className="overflow-hidden rounded-xl bg-white shadow-sm">
      <button
        onClick={expand}
        className="flex w-full items-center gap-2 px-4 py-3 text-left transition-colors hover:bg-gray-50"
      >
        <span className="text-sm font-medium text-gray-800">📋 你的票·财报体检</span>
        <span className="text-meta text-gray-400">一句话看懂赚不赚钱、有没有雷</span>
        <span className="ml-auto inline-flex items-center gap-1 rounded-full bg-gray-100 px-2.5 py-1 text-xs font-medium text-gray-600">
          {open ? "收起" : "展开"}
          <span className="text-[10px]">{open ? "▲" : "▾"}</span>
        </span>
      </button>
      {open && (
        <div className="space-y-2.5 border-t border-gray-100 px-4 py-3">
          {loading && <p className="text-xs text-gray-400">读取财报中…</p>}
          {!loading && stocks.length === 0 && (
            <p className="text-xs text-gray-400">你的自选暂无可展示的 A 股财报数据。</p>
          )}
          {stocks.map((c) => (
            <div key={c}>
              <Link
                href={`/stock/${c}`}
                className="text-sm font-medium text-gray-800 hover:text-brand-600"
              >
                {STOCK_MAP[c]?.name ?? c}
                <span className="ml-1 text-meta text-gray-400">{byCode![c].reportLabel ?? `${byCode![c].year} 年报`}</span>
              </Link>
              <ul className="mt-1 space-y-1">
                {byCode![c].findings.map((f, i) => (
                  <li key={i} className={`text-xs ${COLOR[f.severity]}`}>
                    {f.text}
                  </li>
                ))}
              </ul>
            </div>
          ))}
          {stocks.length > 0 && (
            <p className="text-meta text-gray-300">基于最新财报(Tushare),信息整理,不构成投资建议。</p>
          )}
        </div>
      )}
    </div>
  );
}
