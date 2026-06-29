"use client";

// 产业链上下游图:以本股为中心,左=上游(供货给它的)、右=下游(采购它的)。
// 方向来自 chainEdges 的真实关联边(供货/对标/映射,均有公开依据),非按板块硬凑。
import { useState } from "react";
import Link from "next/link";
import { SECTOR_GLOSS } from "@/data/stocks";

interface Peer {
  code: string;
  name: string;
  market: string;
}

export function ChainPosition({
  sector,
  up,
  down,
}: {
  sector: string;
  up: Peer[];
  down: Peer[];
}) {
  const [open, setOpen] = useState<"up" | "down" | null>(null);
  const sides: { key: "up" | "down"; label: string; list: Peer[] }[] = [
    { key: "up", label: "上游", list: up },
    { key: "down", label: "下游", list: down },
  ];

  // 对齐站内「上中下游」配色:上游=sky 蓝(供货端)、下游=amber 琥珀(需求端);
  // 「你在这」中间锚点保留 brand 紫。三色分明又都是站内已用色。
  const SCHEME = {
    up: {
      box: "bg-sky-50 text-sky-700 hover:bg-sky-100",
      ring: "ring-sky-200",
      ringOpen: "ring-sky-400",
      pill: "bg-sky-100 text-sky-700",
      chevron: "text-sky-400",
    },
    down: {
      box: "bg-amber-50 text-amber-700 hover:bg-amber-100",
      ring: "ring-amber-200",
      ringOpen: "ring-amber-400",
      pill: "bg-amber-100 text-amber-700",
      chevron: "text-amber-500",
    },
  } as const;

  const Btn = ({ side }: { side: { key: "up" | "down"; label: string; list: Peer[] } }) => {
    const clickable = side.list.length > 0;
    const isOpen = open === side.key;
    const c = SCHEME[side.key];
    return (
      <button
        type="button"
        disabled={!clickable}
        onClick={() => setOpen(isOpen ? null : side.key)}
        className={`rounded-md px-3 py-1.5 text-sm transition-colors ${
          clickable
            ? `${c.box} font-medium ring-1 ring-inset ${isOpen ? c.ringOpen : c.ring}`
            : "bg-gray-50 text-gray-300"
        }`}
      >
        {side.label}
        {clickable && (
          <>
            <span className={`ml-1 rounded-full px-1.5 text-xs ${c.pill}`}>
              {side.list.length}
            </span>
            <span className={`ml-1 text-xs ${c.chevron}`}>{isOpen ? "▴" : "▾"}</span>
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
        {/* 中间锚点:柔和的浅 indigo + 描边,不再实心扎眼;不重复全局位置,避免与左侧「上游」撞词 */}
        <span className="rounded-md bg-brand-100 px-3 py-1.5 text-sm font-medium text-brand-700 ring-1 ring-inset ring-brand-300">
          你在这
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

      <p className="mt-2 text-xs text-gray-400">
        {(up.length > 0 || down.length > 0) && (
          <span>上游 = 给它供货的 · 下游 = 买它产品/服务的 · </span>
        )}
        板块:{sector}
        {SECTOR_GLOSS[sector] && (
          <span className="text-gray-400">({SECTOR_GLOSS[sector]})</span>
        )}
      </p>
    </div>
  );
}
