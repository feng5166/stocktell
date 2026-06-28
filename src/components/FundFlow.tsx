"use client";

// 你的票·资金面(P0):自选里的 A 股,显示最新交易日主力净流入 + 龙虎榜。
// 数据来自 Tushare(T+1 收盘后)。散户自己拼不出来的"聪明钱动向",每天一眼。
import { useEffect, useState } from "react";
import { changeClass } from "@/lib/format";

interface FundItem {
  code: string;
  name: string;
  netMf: number | null; // 主力净流入(亿元)
  longhu: { net: number; reason: string } | null;
  rzChgYi: number | null; // 融资余额变化(亿元)
}

function fmtYi(v: number) {
  return `${v > 0 ? "+" : ""}${v.toFixed(1)}亿`;
}

export function FundFlow({ codes }: { codes: Set<string> }) {
  const [items, setItems] = useState<FundItem[]>([]);
  const [date, setDate] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false); // 默认折叠,点开查看
  const codeKey = Array.from(codes).sort().join(",");

  useEffect(() => {
    let active = true;
    setLoading(true);
    fetch("/api/fund-flow", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ codes: codeKey ? codeKey.split(",") : [] }),
    })
      .then((r) => r.json())
      .then((d) => {
        if (!active) return;
        setItems(Array.isArray(d.items) ? d.items : []);
        setDate(d.date ?? null);
        setLoading(false);
      })
      .catch(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, [codeKey]);

  // 至少有一只拿到数据才显示;否则(无 A 股自选 / 接口无权限)整块不渲染
  const shown = items.filter(
    (it) => it.netMf !== null || it.longhu || it.rzChgYi !== null
  );
  if (loading || shown.length === 0) return null;

  return (
    <div className="overflow-hidden rounded-xl border border-gray-200 bg-white">
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center gap-2 px-4 py-3 text-left transition-colors hover:bg-gray-50"
      >
        <span className="text-sm font-medium text-gray-800">💰 你的票·资金面</span>
        <span className="text-[11px] text-gray-400">
          {shown.length} 只{date ? ` · 截至 ${date.slice(5)}` : ""}
        </span>
        <span className="ml-auto inline-flex items-center gap-1 rounded-full bg-gray-100 px-2.5 py-1 text-xs font-medium text-gray-600">
          {open ? "收起" : "展开看主力/龙虎榜"}
          <span className="text-[10px]">{open ? "▲" : "▾"}</span>
        </span>
      </button>
      {open && (
        <div className="border-t border-gray-100 px-4 py-3">
          <div className="space-y-1.5">
            {shown.map((it) => (
              <div
                key={it.code}
                className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm"
              >
                <span className="min-w-[72px] font-medium text-gray-800">
                  {it.name}
                </span>
                {it.netMf !== null && (
                  <span className="text-xs text-gray-500">
                    主力{" "}
                    <span className={`font-mono tabular-nums ${changeClass(it.netMf)}`}>
                      {fmtYi(it.netMf)}
                    </span>
                  </span>
                )}
                {it.rzChgYi !== null && (
                  <span className="text-xs text-gray-500">
                    融资{" "}
                    <span className={`font-mono tabular-nums ${changeClass(it.rzChgYi)}`}>
                      {fmtYi(it.rzChgYi)}
                    </span>
                  </span>
                )}
                {it.longhu && (
                  <span
                    title={it.longhu.reason}
                    className="rounded bg-rose-50 px-1.5 py-0.5 text-[11px] text-rose-600 ring-1 ring-inset ring-rose-600/20"
                  >
                    龙虎榜 {fmtYi(it.longhu.net)}
                  </span>
                )}
              </div>
            ))}
          </div>
          <p className="mt-2 text-[11px] text-gray-300">
            资金面为 Tushare 收盘后数据,仅供参考,不构成投资建议。
          </p>
        </div>
      )}
    </div>
  );
}
