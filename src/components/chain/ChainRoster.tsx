"use client";

// 产业链成分股列表 + 加自选(分享落地页的转化出口之一)。按板块分组,一句话看懂。
// 游客可直接加(useWatchlist 走 localStorage,登录后自动合并);有自选后由 GuestWatchlistNudge 引导登录。
import { useMemo } from "react";
import Link from "next/link";
import { useWatchlist } from "@/components/useWatchlist";
import { track } from "@/lib/analytics";
import type { RosterItem } from "@/data/chains";
import { FRONT_RELATION_RANK, REL_CHIP_CLS } from "@/lib/relation-rank";
import { changeClass, fmtChange } from "@/lib/format";
import { formatBeijingMDHM } from "@/lib/time-label";
import { useChainQuotes } from "@/components/chain/useChainQuotes";

export function ChainRoster({
  chainId,
  members,
  mentioned,
  relations,
  sectorLabels,
  bottomSectors,
  groupOverride,
  groupNotes,
  takeOverride,
  focusSegmentName,
  focusSectors,
}: {
  chainId: string;
  members: RosterItem[];
  mentioned?: Record<string, string>; // code → 今天点名它的简报标题(让清单每天有变化)
  relations?: Record<string, string>; // code → 关系标(直接/间接/情绪/弱映射),电力链页展示
  sectorLabels?: Record<string, string>; // 板块组名改写(如 能源/核电 → 能源侧外溢)
  bottomSectors?: string[]; // 这些组置底,且按数组顺序(靠后更底)
  groupOverride?: Record<string, string>; // code → 分组键(把某只票从 sector 组挪到自定义组,如思源→输配电/电网侧外溢)
  groupNotes?: Record<string, string>; // 组键 → 组说明(覆盖 sector gloss)
  takeOverride?: Record<string, string>; // code → 一句话(覆盖 AI 口径的 retailTake,电力链用 insight 核定 reason)
  focusSegmentName?: string; // 从资金状态进入时,只看被点击的链内环节
  focusSectors?: string[]; // 该环节覆盖的成分股 sector
}) {
  const wl = useWatchlist();
  const visibleMembers = focusSectors?.length
    ? members.filter((member) => focusSectors.includes(member.sector))
    : members;
  const quotePayload = useChainQuotes(visibleMembers.map((member) => member.code));
  const quoteTime = formatBeijingMDHM(quotePayload?.asOf);

  const groups = useMemo(() => {
    const m = new Map<string, { gloss: string; rows: RosterItem[] }>();
    for (const it of visibleMembers) {
      const key = groupOverride?.[it.code] ?? it.sector;
      const g = m.get(key) ?? { gloss: it.gloss, rows: [] };
      g.rows.push(it);
      m.set(key, g);
    }
    // B2-10:组内排序主键=关系档(直接>间接>情绪>弱),mentioned 次之;去掉「龙头」加权
    // (relation-grading-standard.md 明令不得按龙头分级——否则间接的龙头会被顶到直接之上)。
    const rank = (x: RosterItem) =>
      (relations?.[x.code] != null ? FRONT_RELATION_RANK[relations[x.code]] ?? 4 : 4) * 10 -
      (mentioned?.[x.code] ? 1 : 0);
    for (const g of Array.from(m.values()))
      g.rows.sort((a, b) => rank(a) - rank(b));
    const entries = Array.from(m.entries());
    // bottomSectors 里的组置底,且按数组顺序(靠后更底);不在数组里的排最前
    const order = bottomSectors ?? [];
    const rankOf = (k: string) => { const i = order.indexOf(k); return i < 0 ? -1 : i; };
    entries.sort((a, b) => {
      const ra = rankOf(a[0]), rb = rankOf(b[0]);
      if (ra < 0 && rb < 0) return 0;
      if (ra < 0) return -1;
      if (rb < 0) return 1;
      return ra - rb;
    });
    return entries;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visibleMembers, mentioned && Object.keys(mentioned).join(","), bottomSectors?.join(","), groupOverride && Object.keys(groupOverride).join(",")]);

  const addedCount = visibleMembers.filter((m) => wl.has(m.code)).length;

  const onToggle = (code: string) => {
    const wasIn = wl.has(code);
    wl.toggle(code); // 乐观更新 + 后端同步(游客走本地)+ 内部已埋 add_watchlist
    if (!wasIn) track("chain_add_watchlist", { chain: chainId, code });
  };

  return (
    <section
      id={focusSegmentName ? undefined : "chain-roster"}
      className="mt-6 scroll-mt-24"
    >
      <div className="flex items-baseline justify-between">
        <div>
          <h2 className="text-h2 font-semibold text-gray-900">
            {focusSegmentName ? `${focusSegmentName}有哪些票` : "这条链有哪些票"}
          </h2>
          {focusSegmentName && (
            <p className="mt-1 text-xs text-gray-400">仅显示这个环节的核定样本</p>
          )}
        </div>
        <div className="text-right">
          <span className="block text-xs text-gray-400">
            {addedCount > 0 ? `已加自选 ${addedCount} 只` : "点 + 加入自选,每天看它怎么动"}
          </span>
          {quoteTime && (
            <span className="mt-1 block text-[11px] text-gray-400">
              {quotePayload?.cached || !quotePayload?.live ? "缓存截至" : "行情截至"} {quoteTime}
            </span>
          )}
          {focusSegmentName && (
            <Link
              href={`/chain/${chainId}#chain-roster`}
              className="mt-1 block text-xs font-medium text-brand-600 hover:underline"
            >
              查看全部环节 →
            </Link>
          )}
        </div>
      </div>
      {!wl.loggedIn && wl.ready && (
        <p className="mt-1 text-xs text-gray-400">
          游客也能先加,登录后自动同步到你的账号。
        </p>
      )}

      <div className="mt-3 space-y-4">
        {groups.map(([sector, g]) => (
          <div key={sector}>
            <div className="mb-1.5 flex items-baseline gap-2">
              <span className="text-title font-medium text-gray-800">{sectorLabels?.[sector] ?? sector}</span>
              {(groupNotes?.[sector] ?? g.gloss) && <span className="text-xs text-gray-400">· {groupNotes?.[sector] ?? g.gloss}</span>}
            </div>
            <div className="overflow-hidden rounded-xl border border-gray-200 bg-white">
              {g.rows.map((it, i) => {
                const on = wl.has(it.code);
                const quote = quotePayload?.quotes[it.code];
                return (
                  <div
                    key={it.code}
                    className={`flex items-start gap-3 px-3 py-2.5 ${
                      i > 0 ? "border-t border-gray-100" : ""
                    }`}
                  >
                    <div className="group min-w-0 flex-1">
                      <div className="flex items-center gap-1.5">
                        <Link
                          href={`/stock/${it.code}`}
                          className="font-medium text-gray-900 hover:text-brand-700 hover:underline"
                        >
                          {it.name}
                        </Link>
                        {relations?.[it.code] && (
                          <span className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${REL_CHIP_CLS[relations[it.code]] ?? "bg-gray-100 text-gray-600"}`}>
                            {relations[it.code]}
                          </span>
                        )}
                        <span className="text-xs text-gray-300 group-hover:text-brand-400">›</span>
                      </div>
                      {(takeOverride?.[it.code] || it.take) && (
                        <div className="mt-0.5 line-clamp-2 text-xs text-gray-500">
                          {takeOverride?.[it.code] || it.take}
                        </div>
                      )}
                      {mentioned?.[it.code] && (
                        <div className="mt-0.5 text-xs">
                          <span className="font-medium text-brand-600">今日被提到</span>
                          <span className="text-gray-500"> · {mentioned[it.code]}</span>
                        </div>
                      )}
                    </div>
                    <div className="flex shrink-0 flex-col items-end gap-1.5">
                      <div className="min-h-[18px] text-right">
                        {quote ? (
                          <div className="flex items-baseline justify-end gap-1.5 whitespace-nowrap">
                            <span className="font-mono text-xs tabular-nums text-gray-500">
                              {quote.price.toFixed(2)}
                            </span>
                            <span className={`font-mono text-xs font-semibold tabular-nums ${changeClass(quote.change)}`}>
                              {fmtChange(quote.change)}
                            </span>
                          </div>
                        ) : (
                          <span className="text-xs text-gray-300">—</span>
                        )}
                      </div>
                      <button
                        onClick={() => onToggle(it.code)}
                        className={`rounded-lg px-2.5 py-1 text-xs font-medium transition-colors ${
                          on
                            ? "bg-emerald-50 text-emerald-700 ring-1 ring-inset ring-emerald-200"
                            : "bg-brand-600 text-white hover:bg-brand-700"
                        }`}
                        aria-label={on ? "已在自选" : "加入自选"}
                      >
                        {on ? "✓ 已加" : "+ 自选"}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
