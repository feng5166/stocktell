"use client";

// Watchlist 产业链状态板(2.1-W5)。客户端组装:自选 codes(useWatchlist,登录/游客同构)
// × 服务端算好的 链身份 map + 今日信号 map。
// 铁律:关系三档来自 staticRelations(chainMap),今日触发只是独立标记(不变量#3);
// 未覆盖的票在「待验证」组常驻【不消失】(不变量精神:未覆盖≠不存在),给提交复核入口。
import Link from "next/link";
import { useMemo, useState } from "react";
import { useWatchlist } from "@/components/useWatchlist";
import type { WatchChainInfo } from "@/lib/watch-relation";
import { classifyWatchCodes } from "@/lib/watch-groups";

const REL_CHIP: Record<string, string> = {
  直接映射: "bg-rose-50 text-rose-600",
  间接映射: "bg-amber-50 text-amber-700",
  情绪映射: "bg-gray-100 text-gray-500",
};
const SIG_CHIP: Record<string, string> = {
  强: "bg-rose-100 text-rose-700",
  中: "bg-amber-100 text-amber-700",
  弱: "bg-gray-100 text-gray-500",
};

// 信号 chip(触发源/未覆盖组也要亮——信号与关系档是两回事)
function SignalChip({ sig }: { sig?: { strength: string; note: string } }) {
  if (!sig) return null;
  return (
    <span className={`rounded px-1.5 py-0.5 text-[11px] font-medium ${SIG_CHIP[sig.strength] ?? ""}`}>
      ⚡ 今日触发·{sig.strength}
    </span>
  );
}
export default function WatchlistBoard({
  chainMap,
  triggerMap,
  signalMap,
  names,
  date,
}: {
  chainMap: Record<string, WatchChainInfo>;
  triggerMap: Record<string, { chainName: string }>;
  signalMap: Record<string, { strength: string; note: string }>;
  names: Record<string, { name: string; market: string }>;
  date: string;
}) {
  const { codes, ready } = useWatchlist();
  const [submitted, setSubmitted] = useState<Record<string, "ok" | "fail">>({});

  // 四组分流:纯函数 lib/watch-groups(与 scripts/watchlist-smoke.ts 共用,CI 端到端断言)
  const groups = useMemo(
    () => classifyWatchCodes(Array.from(codes), chainMap, triggerMap, names, signalMap),
    [codes, chainMap, triggerMap, signalMap, names]
  );

  async function suggestReview(code: string) {
    try {
      const r = await fetch("/api/relation-review-suggest", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code }),
      });
      const d = await r.json().catch(() => ({ ok: false }));
      setSubmitted((m) => ({ ...m, [code]: r.ok && d.ok ? "ok" : "fail" }));
    } catch {
      setSubmitted((m) => ({ ...m, [code]: "fail" }));
    }
  }

  if (!ready) {
    return <div className="rounded-xl bg-white py-12 text-center text-sm text-gray-400 shadow-sm">加载自选中…</div>;
  }
  if (codes.size === 0) {
    return (
      <div className="rounded-xl border border-dashed border-gray-300 bg-white py-14 text-center">
        <div className="text-sm font-medium text-gray-500">还没有自选</div>
        <div className="mt-1 text-xs text-gray-400">
          去{" "}
          <Link href="/stocks" className="text-brand-600 hover:underline">
            股票池
          </Link>{" "}
          点星标加自选,这里会按产业链聚合它们的今日状态。
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {groups.chains.map(([chainId, g]) => {
        const triggered = g.rows.filter((r) => signalMap[r.code]).length;
        return (
          <section key={chainId} className="rounded-2xl bg-white p-4 shadow-sm">
            <div className="flex items-baseline justify-between gap-2">
              <h2 className="text-sm font-semibold text-gray-800">
                <Link href={`/chain/${chainId}`} className="hover:text-brand-600">
                  {g.chainName}
                </Link>
                <span className="ml-2 text-xs font-normal text-gray-400">
                  {g.rows.length} 只{triggered > 0 ? ` · 今日触发 ${triggered}` : ""}
                </span>
              </h2>
            </div>
            <ul className="mt-2 divide-y divide-gray-50">
              {g.rows.map(({ code, info }) => {
                const sig = signalMap[code];
                return (
                  <li key={code} className="py-2.5">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <Link href={`/stock/${code}`} className="text-sm font-medium text-gray-900 hover:text-brand-600">
                        {names[code]?.name ?? code}
                      </Link>
                      <span className="text-xs text-gray-400">{code}</span>
                      <span className={`rounded px-1.5 py-0.5 text-[11px] font-medium ${REL_CHIP[info.relation] ?? "bg-gray-100 text-gray-500"}`}>
                        {info.relation}
                      </span>
                      <span className="rounded bg-gray-50 px-1.5 py-0.5 text-[11px] text-gray-500">{info.segment}</span>
                      <SignalChip sig={sig} />
                    </div>
                    {sig?.note && (
                      <p className="mt-1 text-xs leading-relaxed text-gray-500">{sig.note}</p>
                    )}
                    {info.verify.length > 0 && (
                      <p className="mt-1 text-meta text-gray-400">验证点:{info.verify.join(" / ")}</p>
                    )}
                  </li>
                );
              })}
            </ul>
          </section>
        );
      })}

      {groups.triggers.length > 0 && (
        <section className="rounded-2xl bg-white p-4 shadow-sm">
          <h2 className="text-sm font-semibold text-gray-800">
            海外触发源
            <span className="ml-2 text-xs font-normal text-gray-400">
              {groups.triggers.length} 只 · 它们是事件源头,不是 A 股映射标的
            </span>
          </h2>
          <ul className="mt-2 divide-y divide-gray-50">
            {groups.triggers.map((code) => {
              const sig = signalMap[code];
              return (
                <li key={code} className="py-2.5">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <Link href={`/stock/${code}`} className="text-sm font-medium text-gray-900 hover:text-brand-600">
                      {names[code]?.name ?? code}
                    </Link>
                    <span className="text-xs text-gray-400">{code}</span>
                    <span className="rounded bg-sky-50 px-1.5 py-0.5 text-[11px] font-medium text-sky-700">触发源</span>
                    <span className="rounded bg-gray-50 px-1.5 py-0.5 text-[11px] text-gray-500">
                      {triggerMap[code]?.chainName}
                    </span>
                    <SignalChip sig={sig} />
                  </div>
                  {sig?.note && <p className="mt-1 text-xs leading-relaxed text-gray-500">{sig.note}</p>}
                </li>
              );
            })}
          </ul>
        </section>
      )}

      {groups.etfs.length > 0 && (
        <section className="rounded-2xl bg-white p-4 shadow-sm">
          <h2 className="text-sm font-semibold text-gray-800">
            ETF
            <span className="ml-2 text-xs font-normal text-gray-400">
              {groups.etfs.length} 只 · ETF 是一篮子股票,不进产业链关系模型
            </span>
          </h2>
          <ul className="mt-2 divide-y divide-gray-50">
            {groups.etfs.map((code) => (
              <li key={code} className="flex flex-wrap items-center gap-1.5 py-2.5">
                <span className="text-sm font-medium text-gray-900">{names[code]?.name ?? code}</span>
                <span className="text-xs text-gray-400">{code}</span>
                <span className="rounded bg-gray-100 px-1.5 py-0.5 text-[11px] text-gray-500">ETF</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {groups.uncovered.length > 0 && (
        <section className="rounded-2xl bg-white p-4 shadow-sm">
          <h2 className="text-sm font-semibold text-gray-800">
            待验证收录
            <span className="ml-2 text-xs font-normal text-gray-400">
              {groups.uncovered.length} 只 · 暂无核定关系档,不代表与产业链无关
            </span>
          </h2>
          <ul className="mt-2 divide-y divide-gray-50">
            {groups.uncovered.map((code) => (
              <li key={code} className="flex flex-wrap items-center gap-1.5 py-2.5">
                <Link href={`/stock/${code}`} className="text-sm font-medium text-gray-900 hover:text-brand-600">
                  {names[code]?.name ?? code}
                </Link>
                <span className="text-xs text-gray-400">{code}</span>
                <span className="rounded bg-gray-100 px-1.5 py-0.5 text-[11px] text-gray-500">待验证</span>
                <SignalChip sig={signalMap[code]} />
                <span className="ml-auto">
                  {submitted[code] === "ok" ? (
                    <span className="text-[11px] text-emerald-600">已提交复核 ✓</span>
                  ) : submitted[code] === "fail" ? (
                    <span className="text-[11px] text-rose-500">提交失败,稍后再试</span>
                  ) : (
                    <button
                      onClick={() => suggestReview(code)}
                      className="rounded border border-gray-300 px-2 py-0.5 text-[11px] text-gray-600 hover:bg-gray-50"
                      title="提交给 StockTell 人工复核该票的产业链关系收录"
                    >
                      提交复核
                    </button>
                  )}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <p className="text-meta text-gray-400">
        今日触发({date})来自当日简报事件,只影响今日状态,不改变长期关系档;关系档来自人工核定的静态关系库。
      </p>
    </div>
  );
}
