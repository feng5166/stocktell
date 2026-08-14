"use client";

// 首屏块②「我的股票今天有什么变化」(2.2.5,client)。不是行情列表——最有价值的不是状态,
// 是「和昨天相比,什么变了」:意图变化/事件点名的置顶讲清楚,没变化的一句「今天没新东西」。
import Link from "next/link";
import { useWatchlist } from "@/components/useWatchlist";
import { STOCK_MAP } from "@/data/stocks";
import { INTENT_SEGMENTS } from "@/lib/market-intent/segments";
import type { WatchChainInfo } from "@/lib/watch-relation";
import { INTENT_CHIP_CLS } from "@/lib/market-intent/ui";
import type { IntentType } from "@/lib/market-intent/types";

export interface SegIntentPair {
  t: { intent: IntentType; label: string };
  y: { intent: IntentType; label: string } | null;
}

const segOfSector = new Map<string, string>();
for (const seg of INTENT_SEGMENTS) for (const s of seg.sectors) segOfSector.set(s, seg.key);

export function HomeMyStocks({
  segIntent,
  named,
  watchChainMap,
}: {
  segIntent: Record<string, SegIntentPair>;
  named: string[];
  watchChainMap: Record<string, WatchChainInfo>;
}) {
  const wl = useWatchlist();
  if (!wl.ready || wl.codes.size === 0) return null;
  const namedSet = new Set(named);

  const rows = Array.from(wl.codes)
    .map((code) => {
      const s = STOCK_MAP[code];
      if (!s || s.market !== "A股") return null;
      const segKey = segOfSector.get(s.sector);
      const pair = segKey ? segIntent[segKey] : undefined;
      const changed = !!(pair?.y && pair.t.intent !== pair.y.intent);
      const isNamed = namedSet.has(code);
      return { code, name: s.name, info: watchChainMap[code], pair, changed, isNamed };
    })
    .filter((r): r is NonNullable<typeof r> => r !== null)
    .sort((a, b) => Number(b.changed || b.isNamed) - Number(a.changed || a.isNamed))
    .slice(0, 8);
  if (rows.length === 0) return null;

  return (
    <section className="mt-5">
      <div className="flex items-baseline justify-between">
        <h2 className="text-h2 font-semibold text-gray-900">我的股票今天有什么变化</h2>
        <Link href="/watchlist" className="text-xs font-medium text-brand-600 hover:underline">
          全部自选 →
        </Link>
      </div>
      <div className="mt-3 space-y-2">
        {rows.map((r) => (
          <Link
            key={r.code}
            href={`/stock/${r.code}`}
            className="block rounded-xl border border-gray-200 bg-white px-4 py-3 transition-colors hover:border-brand-200"
          >
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="text-sm font-semibold text-gray-900">{r.name}</span>
              {r.changed && r.pair && (
                <span className={`inline-flex rounded px-1.5 py-0.5 text-meta font-medium ${INTENT_CHIP_CLS[r.pair.t.intent]}`}>
                  意图变化
                </span>
              )}
              {r.isNamed && (
                <span className="inline-flex rounded bg-brand-50 px-1.5 py-0.5 text-meta font-medium text-brand-700">
                  今日被事件点名
                </span>
              )}
            </div>
            {r.changed || r.isNamed ? (
              <div className="mt-1 space-y-0.5 text-sm leading-relaxed text-gray-700">
                {r.changed && r.pair?.y && (
                  <p>
                    所在板块资金意图:{r.pair.y.label} → <b>{r.pair.t.label}</b>
                  </p>
                )}
                {r.isNamed && <p>今天的链级事件点名了这只票,见上方事件卡与个股页拆解。</p>}
                {r.info && (
                  <p className="text-xs text-gray-500">
                    {r.info.relation} · {r.info.segment}
                    {r.info.verify[0] && <> · 下一验证点:{r.info.verify[0]}</>}
                  </p>
                )}
              </div>
            ) : (
              <p className="mt-1 text-sm text-gray-500">
                今天没新东西。
                {r.info && (
                  <span className="text-xs text-gray-400">
                    {" "}
                    关系不变({r.info.relation} · {r.info.segment}),验证点照旧
                    {r.pair ? `;板块资金${r.pair.t.label}` : ""}。
                  </span>
                )}
              </p>
            )}
          </Link>
        ))}
      </div>
    </section>
  );
}
