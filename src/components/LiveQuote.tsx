"use client";

// 个股详情页头部的实时行情。从服务端组件抽出,让详情页本体可走 ISR(静态外壳秒出),
// 行情按需在客户端拉取,不再让"等新浪"卡住整页首字节。
import { useEffect, useState } from "react";

interface Quote {
  price: number;
  change: number;
}

export function LiveQuote({ code }: { code: string }) {
  const [q, setQ] = useState<Quote | null>(null);
  const [stale, setStale] = useState(false);
  const [asOf, setAsOf] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  useEffect(() => {
    let active = true;
    fetch(`/api/quotes?symbols=${encodeURIComponent(code)}`, { cache: "no-store" })
      .then((r) => r.json())
      .then((d) => {
        if (!active) return;
        const item = d?.quotes?.[code] ?? null;
        setQ(item);
        setStale(Boolean(d?.cached));
        setAsOf(d?.asOf ?? null);
        setDone(true);
      })
      .catch(() => active && setDone(true));
    return () => {
      active = false;
    };
  }, [code]);

  // 加载中:占位,避免布局抖动
  if (!done) return <span className="ml-auto text-sm text-gray-300">···</span>;
  if (!q) return <span className="ml-auto text-sm text-gray-400">休市 / 行情未连接</span>;

  return (
    <span
      className={`ml-auto font-mono text-lg font-semibold tabular-nums ${
        q.change > 0
          ? "text-rose-600"
          : q.change < 0
          ? "text-emerald-600"
          : "text-gray-400"
      }`}
    >
      {q.price.toFixed(2)}{" "}
      <span className="text-sm">
        {q.change > 0 ? "+" : ""}
        {q.change.toFixed(2)}%
      </span>
      {stale && asOf && (
        <span className="ml-1 text-xs font-normal text-gray-400">
          · 截至{" "}
          {new Intl.DateTimeFormat("zh-CN", {
            timeZone: "Asia/Shanghai",
            month: "numeric",
            day: "numeric",
            hour: "2-digit",
            minute: "2-digit",
          }).format(new Date(asOf))}
        </span>
      )}
    </span>
  );
}
