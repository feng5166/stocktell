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
  const [errored, setErrored] = useState(false);
  useEffect(() => {
    let active = true;
    fetch("/api/chain-sentiment", { cache: "no-store" })
      .then((r) => r.json())
      .then((x) => active && setD(x))
      .catch(() => active && setErrored(true));
    return () => {
      active = false;
    };
  }, []);

  // 加载中:占位骨架,别让模块"凭空消失"(首页每天打开的理由,要稳定在场)
  if (!d && !errored) {
    return (
      <div className="mb-4 rounded-xl bg-white px-4 py-3 shadow-sm">
        <div className="text-sm font-semibold text-gray-800">AI链今日情绪</div>
        <div className="mt-2.5 h-3 w-2/3 animate-pulse rounded bg-gray-100" />
        <div className="mt-2 h-3 w-1/2 animate-pulse rounded bg-gray-100" />
      </div>
    );
  }
  // 拿不到数据(数据生成中/接口异常):给静默占位,不整块消失
  if (errored || !d || (!d.a && !d.us)) {
    return (
      <div className="mb-4 rounded-xl bg-white px-4 py-3 text-sm text-gray-400 shadow-sm">
        <span className="font-semibold text-gray-800">AI链今日情绪</span>
        <span className="ml-2">数据生成中,稍后刷新看看</span>
      </div>
    );
  }
  const a = d.a;

  let mood: { t: string; c: string } | null = null;
  if (a) {
    const ratio = a.up / (a.up + a.down || 1);
    mood =
      ratio >= 0.6 && a.avgPct > 0
        ? { t: "偏强", c: "bg-rose-50 text-rose-600" }
        : ratio <= 0.4 && a.avgPct < 0
        ? { t: "偏弱", c: "bg-emerald-50 text-emerald-600" }
        : { t: "中性", c: "bg-gray-100 text-gray-500" };
  }

  return (
    <div className="mb-4 rounded-xl bg-white px-4 py-3 shadow-sm">
      <div className="mb-2.5 flex items-center gap-2">
        <span className="text-sm font-semibold text-gray-800">AI链今日情绪</span>
        {mood && (
          <span
            className={`rounded px-1.5 py-0.5 text-meta ${mood.c}`}
          >
            {mood.t}
          </span>
        )}
        {d.date && (
          <span className="ml-auto text-meta text-gray-400">{d.date.slice(5)}</span>
        )}
      </div>
      <div className="space-y-2">
        {a && (
          <MoodRow
            label="A股"
            up={a.up}
            down={a.down}
            avgPct={a.avgPct}
            extra={
              <>
                {" · 主力 "}
                <span className={changeClass(a.netMfYi)}>{fmtYi(a.netMfYi)}</span>
              </>
            }
          />
        )}
        {d.us && (
          <MoodRow
            label="隔夜美股"
            up={d.us.up}
            down={d.us.down}
            avgPct={d.us.avgPct}
          />
        )}
      </div>
    </div>
  );
}

// 一行情绪:红(涨)/绿(跌)堆叠条 + 家数 + 均涨跌,一眼看多空
function MoodRow({
  label,
  up,
  down,
  avgPct,
  extra,
}: {
  label: string;
  up: number;
  down: number;
  avgPct: number;
  extra?: React.ReactNode;
}) {
  const total = up + down || 1;
  return (
    <div className="flex items-center gap-3 text-xs">
      <span className="w-14 shrink-0 text-gray-500">{label}</span>
      <div className="flex h-2 w-24 shrink-0 overflow-hidden rounded-full bg-gray-100">
        <div className="bg-rose-400" style={{ width: `${(up / total) * 100}%` }} />
        <div
          className="bg-emerald-400"
          style={{ width: `${(down / total) * 100}%` }}
        />
      </div>
      <span className="tabular-nums text-gray-500">
        <span className="text-rose-600">涨{up}</span>
        <span className="text-gray-300"> / </span>
        <span className="text-emerald-600">跌{down}</span>
        {" · 均 "}
        <span className={changeClass(avgPct)}>{fmtPct(avgPct)}</span>
        {extra}
      </span>
    </div>
  );
}
