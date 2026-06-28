"use client";

// 产业链位置图:上游→中游→下游。非当前位置若同板块有标的,可点击展开并跳转。
import { useState } from "react";
import Link from "next/link";

type Pos = "上游" | "中游" | "下游";
interface Peer {
  code: string;
  name: string;
  market: string;
}

export function ChainPosition({
  current,
  sector,
  lists,
}: {
  current: Pos;
  sector: string;
  lists: Record<Pos, Peer[]>;
}) {
  const [open, setOpen] = useState<Pos | null>(null);
  const order: Pos[] = ["上游", "中游", "下游"];

  return (
    <div>
      <div className="flex items-center gap-2">
        {order.map((p, i) => {
          const isCur = p === current;
          const list = lists[p] ?? [];
          const clickable = !isCur && list.length > 0;
          return (
            <div key={p} className="flex items-center gap-2">
              <button
                type="button"
                disabled={!clickable}
                onClick={() => setOpen(open === p ? null : p)}
                className={`rounded-md px-3 py-1.5 text-sm transition-colors ${
                  isCur
                    ? "bg-gray-900 font-medium text-white"
                    : clickable
                    ? `bg-blue-50 font-medium text-blue-700 ring-1 ring-inset hover:bg-blue-100 ${
                        open === p ? "ring-blue-400" : "ring-blue-200"
                      }`
                    : "bg-gray-50 text-gray-300"
                }`}
              >
                {isCur ? `你在这 · ${p}` : p}
                {clickable && (
                  <span className="ml-1 rounded-full bg-blue-100 px-1.5 text-xs text-blue-600">
                    {list.length}
                  </span>
                )}
                {clickable && (
                  <span className="ml-1 text-xs text-blue-400">
                    {open === p ? "▴" : "▾"}
                  </span>
                )}
              </button>
              {i < order.length - 1 && <span className="text-gray-300">→</span>}
            </div>
          );
        })}
      </div>

      {open && (lists[open]?.length ?? 0) > 0 && (
        <div className="mt-2 flex flex-wrap items-center gap-1.5">
          <span className="text-xs text-gray-400">{open}关联:</span>
          {lists[open].map((x) => (
            <Link
              key={x.code}
              href={`/stock/${x.code}`}
              className="rounded bg-gray-100 px-2 py-0.5 text-xs text-gray-700 hover:bg-gray-200"
            >
              {x.name}
              {x.market === "美股" && (
                <span className="ml-0.5 text-blue-500">·美</span>
              )}
            </Link>
          ))}
        </div>
      )}

      <p className="mt-2 text-xs text-gray-400">板块:{sector}</p>
    </div>
  );
}
