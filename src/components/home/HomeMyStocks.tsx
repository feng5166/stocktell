"use client";

// 「我的关注」(2.2.5→首页视觉优化 2026-08-14):表格化五列——股票/所属逻辑/今日资金意图/
// 今日变化/下一验证点。重点不是价格,是「相比昨天发生了什么」:变化列 ↑↓新— 一眼扫出异常。
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

const BULL: IntentType[] = ["accumulation", "rush"];
const BEAR: IntentType[] = ["distribution", "exit"];

// 变化列(三轮走查:变化是主角,直接写 from→to,不再只给箭头符号)
function changeCell(pair: SegIntentPair | undefined, named: boolean) {
  if (pair?.y && pair.t.intent !== pair.y.intent) {
    const toBull = BULL.includes(pair.t.intent) && !BULL.includes(pair.y.intent);
    const toBear = BEAR.includes(pair.t.intent) && !BEAR.includes(pair.y.intent);
    const label = `${pair.y.label} → ${pair.t.label}`;
    if (toBull) return { mark: label, cls: "text-emerald-700", active: true };
    if (toBear) return { mark: label, cls: "text-red-600", active: true };
    return { mark: label, cls: "text-indigo-600", active: true };
  }
  if (named) return { mark: "新出现:事件点名", cls: "text-brand-600", active: true };
  return { mark: "—", cls: "text-gray-300", active: false };
}

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
      const isNamed = namedSet.has(code);
      const chg = changeCell(pair, isNamed);
      return { code, name: s.name, info: watchChainMap[code], pair, chg, active: chg.active };
    })
    .filter((r): r is NonNullable<typeof r> => r !== null)
    .sort((a, b) => Number(b.active) - Number(a.active))
    .slice(0, 8);
  if (rows.length === 0) return null;

  // 三轮走查:所属产业链降级成股票名下方灰色副文本;主列=股票/今日判断/变化/下一验证
  return (
    <section className="mt-8">
      <div className="flex items-baseline justify-between">
        <h2 className="text-h2 font-semibold text-gray-900">我的关注</h2>
        <Link href="/watchlist" className="text-xs font-medium text-brand-600 hover:underline">
          管理关注 →
        </Link>
      </div>
      <div className="mt-3 overflow-hidden rounded-2xl bg-white shadow-sm">
        <div className="hidden gap-3 border-b border-gray-100 px-4 py-2 text-meta text-gray-400 sm:grid sm:grid-cols-[1.3fr_6rem_1.1fr_1.2fr]">
          <span>股票</span>
          <span>今日判断</span>
          <span>变化</span>
          <span>下一验证</span>
        </div>
        <div className="divide-y divide-gray-50">
          {rows.map((r) => (
            <Link
              key={r.code}
              href={`/stock/${r.code}`}
              className="block px-4 py-2.5 transition-colors hover:bg-gray-50 sm:grid sm:grid-cols-[1.3fr_6rem_1.1fr_1.2fr] sm:items-center sm:gap-3"
            >
              <span className="block min-w-0">
                <span className="flex items-baseline gap-1.5">
                  <span className="text-sm font-medium text-gray-900">{r.name}</span>
                  <span className="text-meta text-gray-400">{r.code}</span>
                </span>
                <span className="block truncate text-meta text-gray-400">
                  {r.info ? `${r.info.chainName} · ${r.info.segment}` : "未入关系库"}
                </span>
              </span>
              <span className="mt-1 inline-block sm:mt-0">
                {r.pair ? (
                  <span className={`inline-flex rounded px-1.5 py-0.5 text-xs font-medium ${INTENT_CHIP_CLS[r.pair.t.intent]}`}>
                    {r.pair.t.label}
                  </span>
                ) : (
                  <span className="text-meta text-gray-300">板块未覆盖</span>
                )}
              </span>
              <span className={`mt-0.5 block truncate text-xs font-semibold sm:mt-0 ${r.chg.cls}`}>
                {r.chg.mark}
              </span>
              <span className="mt-0.5 block truncate text-xs text-gray-500 sm:mt-0">
                {r.info?.verify[0] ?? "—"}
              </span>
            </Link>
          ))}
        </div>
      </div>
    </section>
  );
}
