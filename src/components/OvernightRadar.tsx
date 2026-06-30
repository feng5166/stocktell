"use client";

// 首页跨市场预期差雷达(一等卡):隔夜美股已涨、对应 A 股今日暂未跟上的标的,一屏直达。
// 每条挂 强/中/弱 关联标 + 联动有效率徽章;自选 A 股高亮。无 live 信号时整卡自隐藏(不堆砌首页)。
// 纯观察对比口径,不喊补涨/买卖,守合规。
import Link from "next/link";
import { useEffect, useState } from "react";
import { STOCKS, aSharePeers } from "@/data/stocks";
import { edgeInfo, STRENGTH_BADGE, type Strength } from "@/data/relations";
import { useWatchlist } from "@/components/useWatchlist";
import { fmtChange, changeClass } from "@/lib/format";

type Quote = { price: number; change: number };
type LinkageStat = { events: number; rate: number };
const STRENGTH_RANK: Record<Strength, number> = { 强: 0, 中: 1, 弱: 2 };
const GAP = 1.5; // 美股领先 A 股 ≥1.5 个点才算预期差
const US_MOVE = 1; // 美股至少涨 1%
const LINKAGE_MIN = 12;
const MAX_SIGNALS = 4;

function LinkageBadge({ stat }: { stat: LinkageStat | null | undefined }) {
  if (!stat) return null;
  if (stat.events < LINKAGE_MIN)
    return (
      <span
        title={`样本仅 ${stat.events} 次,统计不足,仅供参考(联动有效率·非预测)`}
        className="shrink-0 rounded bg-gray-100 px-1 py-0.5 text-[10px] leading-none text-gray-400"
      >
        样本{stat.events}
      </span>
    );
  const pct = Math.round(stat.rate * 100);
  return (
    <span
      title={`过去2年该美股单日≥2%异动 → 次日A股同向且≥1% 的比例 ${pct}%(样本${stat.events}次)。联动有效率·非预测,历史不代表未来。`}
      className="shrink-0 rounded bg-sky-50 px-1 py-0.5 text-[10px] leading-none text-sky-600"
    >
      联动{pct}%
    </span>
  );
}

export function OvernightRadar() {
  const [quotes, setQuotes] = useState<Record<string, Quote>>({});
  const [live, setLive] = useState(false);
  const [linkage, setLinkage] = useState<Record<string, LinkageStat | null>>({});
  const wl = useWatchlist();

  useEffect(() => {
    let active = true;
    fetch("/api/quotes", { cache: "no-store" })
      .then((r) => r.json())
      .then((d) => {
        if (!active) return;
        setQuotes(d.quotes ?? {});
        setLive(Boolean(d.live));
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, []);

  const q = (c: string) => quotes[c];
  const signals = !live
    ? []
    : STOCKS.filter((s) => s.market === "美股")
        .map((us) => {
          const usq = q(us.code);
          if (!usq || usq.change <= US_MOVE) return null;
          const lagging = aSharePeers(us)
            .map((p) => ({ p, pq: q(p.code) }))
            .filter((x) => x.pq && usq.change - x.pq.change >= GAP)
            .map((x) => ({
              code: x.p.code,
              name: x.p.name,
              change: x.pq!.change,
              strength: (edgeInfo(us.code, x.p.code)?.strength ?? "弱") as Strength,
            }))
            .sort((a, b) => STRENGTH_RANK[a.strength] - STRENGTH_RANK[b.strength]);
          return lagging.length
            ? { code: us.code, name: us.name, change: usq.change, lagging }
            : null;
        })
        .filter((x): x is NonNullable<typeof x> => x !== null)
        .sort((a, b) => b.change - a.change)
        .slice(0, MAX_SIGNALS);

  const pairsKey = signals
    .flatMap((s) => s.lagging.map((l) => `${s.code}:${l.code}`))
    .slice(0, 12)
    .join(",");
  useEffect(() => {
    if (!pairsKey) return;
    let active = true;
    fetch(`/api/linkage?pairs=${encodeURIComponent(pairsKey)}`, { cache: "no-store" })
      .then((r) => r.json())
      .then((d) => active && setLinkage((prev) => ({ ...prev, ...(d.linkage ?? {}) })))
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [pairsKey]);

  if (signals.length === 0) return null;

  return (
    <div className="mb-4 rounded-xl bg-white px-4 py-3 shadow-sm">
      <div className="mb-1 flex items-center gap-2">
        <span className="text-sm font-semibold text-gray-800">
          ⚡ 隔夜美股 · 跟你 A 股的联动
        </span>
      </div>
      <p className="mb-2.5 text-xs text-gray-400">
        美股已涨、对应 A 股今日涨幅暂时落后的(仅供观察对比)
      </p>
      <div className="space-y-2.5">
        {signals.map((s) => (
          <div key={s.code}>
            <div className="mb-1 flex items-center gap-1.5 text-sm">
              <Link
                href={`/stock/${s.code}`}
                className="font-medium text-gray-900 hover:text-brand-600"
              >
                {s.name}
              </Link>
              <span className="font-mono text-xs font-medium text-rose-600">
                隔夜{fmtChange(s.change)}
              </span>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {s.lagging.map((l) => {
                const watched = wl.has(l.code);
                const info = edgeInfo(s.code, l.code);
                return (
                  <Link
                    key={l.code}
                    href={`/stock/${l.code}`}
                    title={info?.basis ?? undefined}
                    className={`flex items-center gap-1 rounded-lg border px-2 py-1 text-xs ${
                      watched
                        ? "border-amber-300 bg-amber-50 hover:border-amber-400"
                        : "border-gray-200 hover:border-gray-400"
                    }`}
                  >
                    <span
                      className={`shrink-0 rounded px-1 py-0.5 text-[10px] leading-none ${STRENGTH_BADGE[l.strength]}`}
                    >
                      {l.strength}
                    </span>
                    <LinkageBadge stat={linkage[`${s.code}:${l.code}`]} />
                    <span className="font-medium text-gray-800">
                      {watched && <span className="text-amber-500">★</span>}
                      {l.name}
                    </span>
                    <span className={`font-mono tabular-nums ${changeClass(l.change)}`}>
                      {fmtChange(l.change)}
                    </span>
                  </Link>
                );
              })}
            </div>
          </div>
        ))}
      </div>
      <p className="mt-2.5 text-[11px] leading-relaxed text-gray-400">
        历史规律不代表未来,不意味 A 股一定补涨。联动有效率为历史统计,非预测。
      </p>
    </div>
  );
}
