"use client";

// 产业链上下游图:以本股为中心,左=上游(供货给它的)、右=下游(采购它的)。
// 方向来自 chainEdges 的真实关联边(供货/对标/映射,均有公开依据),非按板块硬凑。
import { useState } from "react";
import Link from "next/link";

interface Peer {
  code: string;
  name: string;
  market: string;
}

export function ChainPosition({
  pos,
  sector,
  up,
  down,
}: {
  pos: string;
  sector: string;
  up: Peer[];
  down: Peer[];
}) {
  const [open, setOpen] = useState<"up" | "down" | null>(null);
  const sides: { key: "up" | "down"; label: string; list: Peer[] }[] = [
    { key: "up", label: "上游", list: up },
    { key: "down", label: "下游", list: down },
  ];

  const Btn = ({ side }: { side: { key: "up" | "down"; label: string; list: Peer[] } }) => {
    const clickable = side.list.length > 0;
    const isOpen = open === side.key;
    return (
      <button
        type="button"
        disabled={!clickable}
        onClick={() => setOpen(isOpen ? null : side.key)}
        className={`rounded-md px-3 py-1.5 text-sm transition-colors ${
          clickable
            ? `bg-brand-50 font-medium text-brand-700 ring-1 ring-inset hover:bg-brand-100 ${
                isOpen ? "ring-brand-400" : "ring-brand-200"
              }`
            : "bg-gray-50 text-gray-300"
        }`}
      >
        {side.label}
        {clickable && (
          <>
            <span className="ml-1 rounded-full bg-brand-100 px-1.5 text-xs text-brand-600">
              {side.list.length}
            </span>
            <span className="ml-1 text-xs text-brand-400">{isOpen ? "▴" : "▾"}</span>
          </>
        )}
      </button>
    );
  };

  return (
    <div>
      {/* 窄屏可换行,避免上游→你在这→下游 三节点横向溢出;桌面仍单行 */}
      <div className="flex flex-wrap items-center gap-x-2 gap-y-2">
        <Btn side={sides[0]} />
        <span className="text-gray-300">→</span>
        <span className="rounded-md bg-brand-600 px-3 py-1.5 text-sm font-medium text-white">
          你在这 · {pos}
        </span>
        <span className="text-gray-300">→</span>
        <Btn side={sides[1]} />
      </div>

      {open && (
        <div className="mt-2 flex flex-wrap items-center gap-1.5">
          <span className="text-xs text-gray-400">
            {open === "up" ? "上游(供货给它)" : "下游(采购它的)"}:
          </span>
          {(open === "up" ? up : down).map((x) => (
            <Link
              key={x.code}
              href={`/stock/${x.code}`}
              className="rounded bg-gray-100 px-2 py-0.5 text-xs text-gray-700 hover:bg-gray-200"
            >
              {x.name}
              {x.market === "美股" && (
                <span className="ml-0.5 text-brand-500">·美</span>
              )}
            </Link>
          ))}
        </div>
      )}

      <p className="mt-2 text-xs text-gray-400">板块:{sector}</p>
    </div>
  );
}
