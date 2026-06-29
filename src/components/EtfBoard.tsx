"use client";

// 板块 ETF:把 AI 产业链各主题映射到真实龙头 ETF,实时涨跌一眼看。
// 行情走 /api/etf-quotes(新浪),20s 轮询;断连读缓存并标"截至几号"。
// 支持:加自选(★,与个股同一套自选)、覆盖板块标签可点→跳回个股列表按该板块筛选。
import { useEffect, useMemo, useState } from "react";
import { ETFS } from "@/data/etfs";
import { SECTORS } from "@/data/stocks";
import { useWatchlist } from "@/components/useWatchlist";
import { changeClass, fmtChange } from "@/lib/format";

interface Q {
  price: number;
  change: number;
}

const SECTOR_SET = new Set<string>(SECTORS as readonly string[]);

function fmtAsOf(iso: string | null): string {
  if (!iso) return "未知";
  try {
    return new Intl.DateTimeFormat("zh-CN", {
      timeZone: "Asia/Shanghai",
      month: "numeric",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    }).format(new Date(iso));
  } catch {
    return iso.slice(0, 16).replace("T", " ");
  }
}

export function EtfBoard({
  onPickSector,
}: {
  onPickSector?: (sector: string) => void;
}) {
  const wl = useWatchlist();
  const [quotes, setQuotes] = useState<Record<string, Q>>({});
  const [live, setLive] = useState(false);
  const [cached, setCached] = useState(false);
  const [asOf, setAsOf] = useState<string | null>(null);

  // 仅在标签页可见时轮询:后台标签页不再每 20s 空跑(与股票池一致);切回前台立即刷新一次。
  useEffect(() => {
    let active = true;
    let timer: ReturnType<typeof setInterval> | null = null;
    async function load() {
      try {
        const r = await fetch("/api/etf-quotes", { cache: "no-store" });
        const d = await r.json();
        if (!active) return;
        setQuotes(d.quotes ?? {});
        setLive(Boolean(d.live));
        setCached(Boolean(d.cached));
        setAsOf(d.asOf ?? null);
      } catch {
        /* 静默 */
      }
    }
    const start = () => {
      if (!timer) timer = setInterval(load, 20000);
    };
    const stop = () => {
      if (timer) {
        clearInterval(timer);
        timer = null;
      }
    };
    const onVisibility = () => {
      if (document.hidden) stop();
      else {
        load();
        start();
      }
    };
    load();
    if (!document.hidden) start();
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      active = false;
      stop();
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, []);

  const covered = Object.keys(quotes).length;

  // 自选 ETF 置顶(与股票池一致),内部各自保持原顺序
  const ordered = useMemo(() => {
    const starred = ETFS.filter((e) => wl.codes.has(e.code));
    if (starred.length === 0 || starred.length === ETFS.length) return ETFS;
    return [...starred, ...ETFS.filter((e) => !wl.codes.has(e.code))];
  }, [wl.codes]);

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-gray-400">
          各板块主题对应的龙头 ETF(研究归并,规模为量级参考)。看不懂个股、想一篮子布局某方向时用;点覆盖板块可跳去看成分个股。
        </p>
        <div className="flex items-center gap-1.5 text-xs text-gray-400">
          <span
            className={`inline-block h-1.5 w-1.5 rounded-full ${
              live ? "bg-emerald-500" : cached ? "bg-amber-400" : "bg-gray-300"
            }`}
          />
          {live
            ? `行情已连接 · ${covered}/${ETFS.length}`
            : cached
            ? `行情未连接 · 截至 ${fmtAsOf(asOf)} 的缓存`
            : "行情未连接 · 暂无数据"}
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        {ordered.map((e) => {
          const q = quotes[e.code];
          const on = wl.has(e.code);
          return (
            <div key={e.code} className="rounded-xl bg-white p-4 shadow-sm">
              <div className="flex items-baseline gap-2">
                <button
                  onClick={() => wl.toggle(e.code)}
                  title={on ? "取消自选" : "加自选"}
                  aria-label={on ? "取消自选" : "加自选"}
                  className={`shrink-0 self-center text-base leading-none transition-colors ${
                    on ? "text-amber-500" : "text-gray-300 hover:text-amber-400"
                  }`}
                >
                  {on ? "★" : "☆"}
                </button>
                <span className="font-semibold text-gray-900">{e.name}</span>
                <span className="font-mono text-xs text-gray-400">{e.code}</span>
                <span className="rounded bg-gray-100 px-1 py-0.5 text-[10px] font-medium text-gray-500">
                  {e.exchange}
                </span>
                <span
                  className={`ml-auto font-mono text-sm font-semibold tabular-nums ${
                    q ? changeClass(q.change) : "text-gray-300"
                  }`}
                >
                  {q ? (
                    <>
                      {q.price.toFixed(3)}{" "}
                      <span className="text-xs">{fmtChange(q.change)}</span>
                    </>
                  ) : (
                    "—"
                  )}
                </span>
              </div>

              <div className="mt-1 text-xs text-gray-500">
                {e.theme} · 跟踪 {e.tracksIndex} · 规模 ~{e.scaleYi}亿
              </div>

              <div className="mt-2 flex flex-wrap gap-1">
                {e.covers.map((c) => {
                  const clickable = SECTOR_SET.has(c) && !!onPickSector;
                  return clickable ? (
                    <button
                      key={c}
                      onClick={() => onPickSector!(c)}
                      title={`查看 ${c} 的成分个股`}
                      className="rounded bg-sky-50 px-1.5 py-0.5 text-[11px] text-sky-700 ring-1 ring-inset ring-sky-100 hover:bg-sky-100"
                    >
                      {c} ↗
                    </button>
                  ) : (
                    <span
                      key={c}
                      className="rounded bg-gray-50 px-1.5 py-0.5 text-[11px] text-gray-500"
                    >
                      {c}
                    </span>
                  );
                })}
              </div>

              <p className="mt-2 text-[11px] leading-relaxed text-gray-400">{e.note}</p>
            </div>
          );
        })}
      </div>

      <p className="mt-3 text-xs text-gray-400">
        ETF 为研究归并的板块代理,覆盖关系/规模为量级参考,不构成投资建议。
      </p>
    </div>
  );
}
