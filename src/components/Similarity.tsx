"use client";

// P1 历史相似性:详情页展示某 A 股 vs 其主关联美股的历史统计。
// 无主关联美股 / 数据不足 → 不渲染。严格"历史统计非预测"口径。
import { useEffect, useState } from "react";

interface SimGroup {
  dir: "涨" | "跌";
  events: number;
  sameDir: number;
  avgNext: number;
}
interface SimResult {
  triggerName: string;
  aName: string;
  windowYears: number;
  total: number;
  groups: SimGroup[];
}

function fmtPct(v: number) {
  return `${v > 0 ? "+" : ""}${v.toFixed(2)}%`;
}

export function Similarity({ code }: { code: string }) {
  const [data, setData] = useState<SimResult | null>(null);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    let active = true;
    fetch(`/api/similarity?code=${encodeURIComponent(code)}`, {
      cache: "no-store",
    })
      .then((r) => r.json())
      .then((d) => {
        if (active) {
          setData(d.result ?? null);
          setLoading(false);
        }
      })
      .catch(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, [code]);

  if (loading || !data) return null;
  const small = data.total < 10;

  return (
    <section className="mb-4 rounded-xl bg-white shadow-sm p-4">
      <h2 className="mb-2 text-xs font-medium uppercase tracking-wide text-gray-400">
        历史相似性
      </h2>
      <p className="mb-2 text-xs text-gray-500">
        主关联美股:
        <span className="font-medium text-gray-700">{data.triggerName}</span> ·
        过去 {data.windowYears} 年
      </p>
      <div className="space-y-2 text-sm">
        {data.groups.map((g) => (
          <div key={g.dir} className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-gray-700">
            <span>
              {data.triggerName}单日{g.dir}≥2%
            </span>
            <span className="text-gray-400">共 {g.events} 次 →</span>
            <span>
              次日{data.aName}平均{" "}
              <span
                className={
                  g.avgNext > 0
                    ? "font-medium text-rose-600"
                    : g.avgNext < 0
                    ? "font-medium text-emerald-600"
                    : "text-gray-500"
                }
              >
                {fmtPct(g.avgNext)}
              </span>
            </span>
            <span className="text-gray-400">
              ,同向 {g.sameDir}/{g.events}
            </span>
          </div>
        ))}
      </div>
      <p className="mt-2 text-[11px] leading-relaxed text-gray-400">
        {small && "样本较少,仅供参考。"}口径:美股单日|涨跌|≥2% 视为异动,取
        A 股次一交易日表现。历史统计,非预测,不构成投资建议。
      </p>
    </section>
  );
}
