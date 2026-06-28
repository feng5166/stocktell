"use client";

// 战绩明细·真分页:服务端给首页(initial),滚到底向 /api/outcomes 要下一页,带"加载中"状态。
import { useCallback, useEffect, useRef, useState } from "react";
import type { OutcomeRow } from "@/lib/outcomes";
import { OutcomeTable } from "@/components/OutcomeTable";

const PAGE = 20;

export function OutcomeFeed({
  backtest,
  initial,
  initialHasMore,
}: {
  backtest: boolean;
  initial: OutcomeRow[];
  initialHasMore: boolean;
}) {
  const [rows, setRows] = useState<OutcomeRow[]>(initial);
  const [hasMore, setHasMore] = useState(initialHasMore);
  const [loading, setLoading] = useState(false);
  const obs = useRef<IntersectionObserver | null>(null);
  const busy = useRef(false);

  const loadMore = useCallback(async () => {
    if (busy.current || !hasMore) return;
    // 游标 = 已加载最后一行 id(orderBy 末位是唯一 id,稳定 seek,不随翻深变慢)
    const cursor = rows[rows.length - 1]?.id;
    if (!cursor) {
      setHasMore(false);
      return;
    }
    busy.current = true;
    setLoading(true);
    try {
      const r = await fetch(
        `/api/outcomes?backtest=${backtest ? 1 : 0}&cursor=${encodeURIComponent(
          cursor
        )}&limit=${PAGE}`,
        { cache: "no-store" }
      ).then((x) => x.json());
      if (r?.ok && Array.isArray(r.rows)) {
        setRows((prev) => [...prev, ...r.rows]);
        setHasMore(Boolean(r.hasMore));
      } else {
        setHasMore(false);
      }
    } catch {
      setHasMore(false);
    } finally {
      busy.current = false;
      setLoading(false);
    }
  }, [backtest, rows, hasMore]);

  const setSentinel = useCallback(
    (el: HTMLElement | null) => {
      obs.current?.disconnect();
      if (!el) return;
      obs.current = new IntersectionObserver(
        (entries) => {
          if (entries[0].isIntersecting) loadMore();
        },
        { rootMargin: "300px" }
      );
      obs.current.observe(el);
    },
    [loadMore]
  );

  useEffect(() => () => obs.current?.disconnect(), []);

  return (
    <>
      <OutcomeTable rows={rows} />
      {hasMore && (
        <div
          ref={setSentinel}
          className="flex items-center justify-center gap-2 py-4 text-xs text-gray-400"
        >
          {loading ? (
            <>
              <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-gray-300 border-t-gray-500" />
              加载中…
            </>
          ) : (
            "下拉加载更多"
          )}
        </div>
      )}
    </>
  );
}
