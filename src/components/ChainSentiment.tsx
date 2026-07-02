"use client";

// P2 AI链情绪仪表盘:首页顶部一条今日情绪(A股整体 + 隔夜美股),给个每天打开的理由。
import { useEffect, useState, type ReactNode } from "react";
import { changeClass } from "@/lib/format";
import { INDEX_FULL, FEIBAN_NOTE } from "@/data/indices";

interface A {
  up: number;
  down: number;
  flat: number;
  avgPct: number;
  netMfYi: number | null;
  covered: number;
  pctLive?: boolean; // 家数/均涨跌是否盘中实时
  pctAsOf?: string; // 家数/均涨跌时点:实时"HH:MM" / EOD"YYYY-MM-DD"
  netMfDate?: string | null; // 主力净流入的 EOD 交易日(始终收盘)
}
interface US {
  up: number;
  down: number;
  avgPct: number;
  covered: number;
  indices?: { name: string; change: number }[];
}
interface Data {
  date: string | null;
  a: A | null;
  us: US | null;
}

const fmtPct = (v: number) => `${v > 0 ? "+" : ""}${v.toFixed(2)}%`;
const fmtYi = (v: number) => `${v > 0 ? "+" : ""}${v.toFixed(1)}亿`;

// initial 由首页 ISR 服务端算好直接传入 → 首屏即出、零客户端请求(原来是挂载后再跨境拉一次,很慢)。
// 不传 initial 时(其它复用场景)仍回退到客户端拉取。
export function ChainSentiment({
  initial,
  action,
  refresh,
}: {
  initial?: Data;
  action?: ReactNode; // 右下角可选插槽(首页塞"看/分享"入口;落地页不传)
  refresh?: boolean; // 服务端快照已过期 → 即便有 initial 也后台拉一次最新(顺带触发服务端回写缓存)
}) {
  // 只把"有实际数据"的 initial 当作可用;服务端那次冷算超时返回的空 initial 不算,
  // 否则会卡在"数据生成中"且不再客户端兜底(空态自愈不了)。
  const initialOk = !!(initial && (initial.a || initial.us));
  const [d, setD] = useState<Data | null>(initialOk ? (initial as Data) : null);
  const [errored, setErrored] = useState(false);
  useEffect(() => {
    // 服务端注入了有效且新鲜的 EOD(非实时)数据 → 无需再拉;
    // "盘中实时"可能被 ISR 缓存住(时点偏旧)、或服务端快照已过期(refresh)→ 后台拉最新。
    if (initialOk && !initial?.a?.pctLive && !refresh) return;
    let active = true;
    fetch("/api/chain-sentiment", { cache: "no-store" })
      .then((r) => r.json())
      .then((x) => active && x && (x.a || x.us) && setD(x))
      // 有 initial 时,刷新失败别把已渲染内容清空;仅无 initial 时才报错占位
      .catch(() => active && !initialOk && setErrored(true));
    return () => {
      active = false;
    };
  }, [initialOk, initial, refresh]);

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

  // A股 EOD(涨跌/主力净流入)Tushare 傍晚才发布。交易日盘后、数据还停在上一交易日时,
  // 给一句"约傍晚更新"提示,免得用户以为没更新。周末不显示(本就无当日数据)。
  const fmtDay = (dt: Date) =>
    new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Shanghai",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(dt);
  const wd = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Shanghai",
    weekday: "short",
  }).format(new Date());
  const aStale = Boolean(
    d.date && d.date !== fmtDay(new Date()) && wd !== "Sat" && wd !== "Sun"
  );

  return (
    <div className="mb-4 rounded-xl bg-white px-4 py-3 shadow-sm">
      <div className="mb-2.5 flex items-center gap-2">
        <span className="text-sm font-semibold text-gray-800">AI链今日情绪</span>
        {mood && (
          <span className={`rounded px-1.5 py-0.5 text-meta ${mood.c}`}>{mood.t}</span>
        )}
        {a?.pctLive ? (
          <span className="ml-auto flex items-center gap-1 text-meta text-rose-500">
            <span className="inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-rose-500" />
            实时 {a.pctAsOf}
          </span>
        ) : (
          d.date && (
            <span className="ml-auto text-meta text-gray-400">{d.date.slice(5)} 收盘</span>
          )
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
              a.netMfYi != null ? (
                <>
                  {" · 主力 "}
                  <span className={changeClass(a.netMfYi)}>{fmtYi(a.netMfYi)}</span>
                </>
              ) : undefined
            }
          />
        )}
        {d.us && (d.us.covered > 0 || (d.us.indices?.length ?? 0) > 0) && (
          <div className="space-y-1">
            {d.us.covered > 0 && (
              <MoodRow
                label="隔夜美股"
                up={d.us.up}
                down={d.us.down}
                avgPct={d.us.avgPct}
              />
            )}
            {d.us.indices && d.us.indices.length > 0 && (
              <>
                <div className="flex items-center gap-3 text-xs">
                  <span className="w-14 shrink-0 text-gray-400">
                    {d.us.covered > 0 ? "大盘" : "隔夜美股"}
                  </span>
                  <span className="flex flex-wrap gap-x-2.5 gap-y-0.5 text-gray-500">
                    {d.us.indices.map((ix) => (
                      <span key={ix.name} className="whitespace-nowrap">
                        <span
                          title={INDEX_FULL[ix.name]}
                          className={
                            INDEX_FULL[ix.name]
                              ? "cursor-help border-b border-dotted border-gray-300"
                              : ""
                          }
                        >
                          {ix.name}
                        </span>{" "}
                        <span className={`tabular-nums ${changeClass(ix.change)}`}>
                          {fmtPct(ix.change)}
                        </span>
                      </span>
                    ))}
                  </span>
                </div>
                <p className="pl-[4.25rem] text-[10px] text-gray-400">{FEIBAN_NOTE}</p>
              </>
            )}
          </div>
        )}
      </div>
      {a?.pctLive
        ? a.netMfYi != null &&
          a.netMfDate && (
            <p className="mt-2 text-meta text-gray-400">
              涨跌为盘中实时;主力净流入为 {a.netMfDate} 收盘数据(今日盘后更新)
            </p>
          )
        : aStale && (
            <p className="mt-2 text-meta text-gray-400">
              A股为 {d.date} 收盘数据 · 今日盘后数据约傍晚更新
            </p>
          )}
      {/* 右下角可选入口(首页塞"看/分享";落地页不传)——样式对齐"深读这条" */}
      {action && <div className="mt-2 text-right">{action}</div>}
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
