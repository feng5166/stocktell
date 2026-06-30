"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { SiteHeader } from "@/components/SiteHeader";
import { useWatchlist, type UseWatchlist } from "@/components/useWatchlist";
import { useProgressive } from "@/components/useProgressive";
import { ChainSwitcher } from "@/components/ChainSwitcher";
import { EtfBoard } from "@/components/EtfBoard";
import { EtfStrip } from "@/components/EtfStrip";
import { FeedbackLink } from "@/components/FeedbackLink";
import { ETFS } from "@/data/etfs";
import { changeClass, fmtChange } from "@/lib/format";
import { Th, Td } from "@/components/Table";
import { DISCLAIMER } from "@/lib/constants";
import {
  STOCKS,
  aSharePeers,
  SECTORS,
  RELATION_TYPES,
  TIER,
  type Market,
  type Position,
  type Stock,
} from "@/data/stocks";
import { CONCEPTS } from "@/data/concepts.generated";

// 全部概念(按出现频次降序),给筛选下拉用
const ALL_CONCEPTS = Object.values(CONCEPTS)
  .flat()
  .reduce<Record<string, number>>((acc, c) => ((acc[c] = (acc[c] || 0) + 1), acc), {});
const CONCEPT_OPTIONS = Object.keys(ALL_CONCEPTS).sort(
  (a, b) => ALL_CONCEPTS[b] - ALL_CONCEPTS[a] || a.localeCompare(b)
);

// 概念 chips(可点 → 跳股票池筛该概念);列表/卡片用
function ConceptChips({ code, max = 3 }: { code: string; max?: number }) {
  const cs = (CONCEPTS[code] ?? []).slice(0, max);
  if (!cs.length) return null;
  return (
    <>
      {cs.map((c) => (
        <Link
          key={c}
          href={`/stocks?concept=${encodeURIComponent(c)}`}
          onClick={(e) => e.stopPropagation()}
          className="rounded bg-gray-100 px-1 py-0.5 text-[10px] text-gray-500 hover:bg-brand-50 hover:text-brand-600"
        >
          {c}
        </Link>
      ))}
    </>
  );
}

// 梯队徽标:龙头=琥珀金、二线=浅蓝;无标签不显示
function TierTag({ code }: { code: string }) {
  const t = TIER[code];
  if (!t) return null;
  return (
    <span
      className={`ml-1 shrink-0 rounded px-1 py-0.5 text-[10px] ${
        t === "龙头" ? "bg-amber-100 font-medium text-amber-700" : "bg-sky-50 text-sky-600"
      }`}
    >
      {t}
    </span>
  );
}

// 状态标做减法:只保留有信号的「今日有新消息」红标;「行情覆盖」不挂标(满屏灰标=噪音),
// 「长期观察」改名字旁一个极轻的小灰点示意外围标的,不再用色块徽标。
function StatusBadge({ status, className = "" }: { status: string; className?: string }) {
  if (status !== "今日有新消息") return null;
  return (
    <span
      className={`inline-flex whitespace-nowrap rounded bg-rose-50 px-1.5 py-0.5 text-xs text-rose-600 ${className}`}
    >
      今日有新消息
    </span>
  );
}
function WatchDot({ status }: { status: string }) {
  if (status !== "长期观察") return null;
  return (
    <span
      title="长期观察:外围标的,长期叙事为主,关注度较低"
      className="ml-1.5 inline-block h-1 w-1 shrink-0 rounded-full bg-gray-300 align-middle"
    />
  );
}

const TABS = ["股票列表", "板块ETF", "关联图谱", "特征矩阵", "主动发现"] as const;
type Tab = (typeof TABS)[number];

const MARKETS: ("全部" | Market)[] = ["全部", "美股", "A股"];
const POSITIONS: ("全部" | Position)[] = ["全部", "上游", "中游", "下游"];

// 缓存行情的"截至"时间(Asia/Shanghai)
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

// 行情未连接(live=false)时,绝不显示种子里编造的价格/涨跌,一律给"—"。
// 散户宁可看到"休市/未连接",也不该被一个看似真实的假数字误导。
function livePrice(s: Stock) {
  return s.live ? s.price.toFixed(2) : "—";
}
function liveChange(s: Stock) {
  return s.live ? fmtChange(s.change) : "—";
}
function liveChangeClass(s: Stock) {
  return s.live ? changeClass(s.change) : "text-gray-300";
}

const POSITION_BADGE: Record<Position, string> = {
  上游: "bg-sky-50 text-sky-700",
  中游: "bg-violet-50 text-violet-700",
  下游: "bg-amber-50 text-amber-700",
};

interface Quote {
  price: number;
  change: number;
}

export default function Dashboard() {
  const [tab, setTab] = useState<Tab>("股票列表");
  const [market, setMarket] = useState<(typeof MARKETS)[number]>("A股");
  const [position, setPosition] = useState<(typeof POSITIONS)[number]>("全部");
  const [sector, setSector] = useState<string>("全部");
  const [tier, setTier] = useState<"全部" | "龙头" | "二线">("全部");
  const [concept, setConcept] = useState<string>("全部");
  const [relation, setRelation] = useState<string>("全部关系");
  const [query, setQuery] = useState("");
  const [onlyWatch, setOnlyWatch] = useState(false);
  const [filterOpen, setFilterOpen] = useState(true); // 手机筛选区:默认展开(可手动收起)
  const wl = useWatchlist();
  // 新手在本页第一次加自选 → 显示"已加,回首页看相关"的闭环提示(只对本次从 0 起步的用户)
  const [addedHint, setAddedHint] = useState(false);
  const prevWatchSize = useRef<number | null>(null);
  useEffect(() => {
    if (!wl.ready) return;
    if (prevWatchSize.current === 0 && wl.codes.size > 0) setAddedHint(true);
    prevWatchSize.current = wl.codes.size;
  }, [wl.ready, wl.codes.size]);
  // 统计卡点击后,股票列表按此视图收窄(all/live/up/down)
  const [statView, setStatView] = useState<"all" | "live" | "up" | "down">("all");

  const [quotes, setQuotes] = useState<Record<string, Quote>>({});
  const [etfQuotes, setEtfQuotes] = useState<Record<string, Quote>>({}); // 板块 ETF 行情(给顶部 ETF 条)
  const [live, setLive] = useState(false);
  const [cached, setCached] = useState(false); // 行情未连接时显示的是缓存数据
  const [quotesAsOf, setQuotesAsOf] = useState<string | null>(null); // 缓存截至时间
  const [newsCodes, setNewsCodes] = useState<Set<string>>(new Set());

  // 从早报/个股页链接进来:?sector= / ?concept= / ?tier= 自动选中并放开市场到「全部」
  useEffect(() => {
    const sp = new URLSearchParams(window.location.search);
    const sec = sp.get("sector");
    const con = sp.get("concept");
    const tr = sp.get("tier");
    if (sec || con || tr) setMarket("全部");
    if (sec) setSector(sec);
    if (con) setConcept(con);
    if (tr === "龙头" || tr === "二线") setTier(tr);
  }, []);

  // 今日简报涉及的标的 = 真实"今日有新消息"
  useEffect(() => {
    fetch("/api/briefing/news", { cache: "no-store" })
      .then((r) => r.json())
      .then((d) => setNewsCodes(new Set<string>(d.codes ?? [])))
      .catch(() => {});
  }, []);

  // 轮询真实行情;拿不到则继续用模拟数据。
  // 仅在标签页可见时轮询:后台标签页不再每 20s 空跑(省电、省请求);切回前台立即刷新一次。
  useEffect(() => {
    let active = true;
    let timer: ReturnType<typeof setInterval> | null = null;
    async function load() {
      try {
        // ETF 行情与个股一起拉(失败各自静默,不互相拖累)
        fetch("/api/etf-quotes", { cache: "no-store" })
          .then((x) => x.json())
          .then((d) => active && setEtfQuotes(d.quotes ?? {}))
          .catch(() => {});
        const r = await fetch("/api/quotes", { cache: "no-store" });
        const data = await r.json();
        if (!active) return;
        setQuotes(data.quotes ?? {});
        setLive(Boolean(data.live));
        setCached(Boolean(data.cached));
        setQuotesAsOf(data.asOf ?? null);
      } catch {
        /* 静默回退到模拟数据 */
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

  // 用真实行情覆盖模拟值
  const rows: Stock[] = useMemo(() => {
    return STOCKS.map((s) => {
      const q = quotes[s.code];
      return q ? { ...s, price: q.price, change: q.change, live: true } : s;
    });
  }, [quotes]);

  const filtered = useMemo(() => {
    return rows.filter((s) => {
      if (onlyWatch && !wl.codes.has(s.code)) return false;
      // 搜索时放开市场过滤:否则默认锁「A股」会让搜美股(英伟达/NVDA)直接 0 结果、像"本站没有"
      if (!query.trim() && market !== "全部" && s.market !== market) return false;
      if (position !== "全部" && s.position !== position) return false;
      if (sector !== "全部" && s.sector !== sector) return false;
      if (tier !== "全部" && TIER[s.code] !== tier) return false;
      if (concept !== "全部" && !(CONCEPTS[s.code] ?? []).includes(concept)) return false;
      if (
        relation !== "全部关系" &&
        !(s.relationTypes as readonly string[]).includes(relation)
      )
        return false;
      if (query.trim()) {
        const q = query.trim().toLowerCase();
        const hay =
          `${s.code} ${s.name} ${s.positioning} ${s.sector} ${(CONCEPTS[s.code] ?? []).join(" ")}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [rows, market, position, sector, tier, concept, relation, query, onlyWatch, wl.codes]);

  const stats = useMemo(() => {
    const coverage = filtered.filter((s) => s.live).length;
    // 涨跌只统计真实行情;行情未连接时不拿模拟值充数
    const up = filtered.filter((s) => s.live && s.change > 0).length;
    const down = filtered.filter((s) => s.live && s.change < 0).length;
    return { total: filtered.length, coverage, up, down };
  }, [filtered]);

  // 股票列表实际展示行:在筛选结果上再叠加统计卡选的视图
  const listRows = useMemo(() => {
    let base = filtered;
    if (statView === "live") base = filtered.filter((s) => s.live);
    else if (statView === "up")
      base = filtered.filter((s) => s.live && s.change > 0);
    else if (statView === "down")
      base = filtered.filter((s) => s.live && s.change < 0);
    // 自选置顶:稳定排序,自选内部 / 非自选内部各自保持原有顺序
    const watched = base.filter((s) => wl.codes.has(s.code));
    if (watched.length === 0 || watched.length === base.length) return base;
    return [...watched, ...base.filter((s) => !wl.codes.has(s.code))];
  }, [filtered, statView, wl.codes]);

  // 「股票列表」顶部相关板块 ETF:自选的 / 搜索命中的 / 当前板块的 才露出,自选置顶。
  // ETF 无位置/关系字段,故位置或关系一旦收窄(非"全部")就不显示;美股市场也不显示(ETF 是 A 股)。
  const listEtfs = useMemo(() => {
    if (market === "美股") return [];
    if (position !== "全部" || relation !== "全部关系") return [];
    const q = query.trim().toLowerCase();
    const matched = ETFS.filter((e) => {
      if (wl.codes.has(e.code)) return true;
      if (q && `${e.code} ${e.name} ${e.theme} ${e.covers.join(" ")}`.toLowerCase().includes(q))
        return true;
      if (sector !== "全部" && e.covers.includes(sector)) return true;
      return false;
    });
    const watched = matched.filter((e) => wl.codes.has(e.code));
    const rest = matched.filter((e) => !wl.codes.has(e.code));
    return [...watched, ...rest];
  }, [market, position, relation, sector, query, wl.codes]);

  // 点统计卡:切到股票列表 + 设视图;再点同一个则取消回全部
  const pickStat = (v: "all" | "live" | "up" | "down") => {
    setStatView((cur) => (v !== "all" && cur === v ? "all" : v));
    setTab("股票列表");
  };

  return (
    <div className="min-h-screen bg-canvas text-ink">
      <SiteHeader active="股票池" wide />

      <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6">
        <div className="mb-4 flex flex-wrap items-end justify-between gap-2">
          <div>
            <div className="flex items-center gap-2.5">
              <h1 className="text-h1 font-semibold tracking-tight">
                AI产业链股票池
              </h1>
              <FeedbackLink />
            </div>
            <p className="mt-1 text-xs text-gray-400">
              数据来源于研究框架梳理 · 非确认的客户/供应商/持仓关系 ·
              不构成投资建议
            </p>
          </div>
          <div className="flex items-center gap-1.5 text-xs text-gray-400">
            <span
              className={`inline-block h-1.5 w-1.5 rounded-full ${
                live ? "bg-emerald-500" : cached ? "bg-amber-400" : "bg-gray-300"
              }`}
            />
            {live
              ? `行情已连接 · 覆盖 ${stats.coverage}/${filtered.length}`
              : cached
              ? `行情未连接 · 显示截至 ${fmtAsOf(quotesAsOf)} 的缓存行情`
              : "行情未连接 · 暂无数据"}
          </div>
        </div>

        {/* 产业链切换:AI 当前,其他「开发中」可投「我想要」 */}
        <ChainSwitcher />

        {/* Tab 导航 */}
        <div className="mb-4 flex gap-1 overflow-x-auto border-b border-gray-200">
          {TABS.map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`-mb-px shrink-0 whitespace-nowrap border-b-2 px-3 py-2 text-sm transition-colors ${
                tab === t
                  ? "border-gray-900 font-medium text-gray-900"
                  : "border-transparent text-gray-400 hover:text-gray-700"
              }`}
            >
              {t}
            </button>
          ))}
        </div>

        {/* 新手引导:还没自选时一句话教他干嘛;本页第一次加完自选后变成"回首页看相关"的闭环提示 */}
        {tab === "股票列表" && wl.ready && wl.codes.size === 0 && (
          <div className="mb-4 rounded-xl border border-brand-100 bg-brand-50/50 px-4 py-3 text-sm text-gray-700">
            👋 第一次来?在下方<b>搜你拿的票</b>,点 <b>☆</b> 加自选 —— 首页「和我相关」就只给你看跟你票相关的动态。
          </div>
        )}
        {tab === "股票列表" && wl.ready && wl.codes.size > 0 && addedHint && (
          <div className="mb-4 flex items-center gap-3 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
            <span className="flex-1">
              ✓ 已加 {wl.codes.size} 只自选!回首页看{" "}
              <Link href="/#mine" className="font-medium underline hover:text-emerald-900">
                「和我相关」
              </Link>{" "}
              就只给你看跟你票相关的动态。
            </span>
            <button
              onClick={() => setAddedHint(false)}
              className="shrink-0 text-emerald-400 hover:text-emerald-600"
              aria-label="关闭"
            >
              ✕
            </button>
          </div>
        )}

        {/* 统计面板 + 筛选区:对个股列表/图谱有效,ETF 标签页不适用故隐藏 */}
        {tab !== "板块ETF" && (
        <>
        <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <StatCard
            label="当前标的"
            value={stats.total}
            active={statView === "all"}
            onClick={() => pickStat("all")}
          />
          <StatCard
            label="行情覆盖"
            value={stats.coverage}
            active={statView === "live"}
            onClick={() => pickStat("live")}
          />
          <StatCard
            label="上涨标的"
            value={stats.up}
            tone="up"
            active={statView === "up"}
            onClick={() => pickStat("up")}
          />
          <StatCard
            label="下跌标的"
            value={stats.down}
            tone="down"
            active={statView === "down"}
            onClick={() => pickStat("down")}
          />
        </div>

        {/* 筛选区 */}
        <div className="mb-4 space-y-3 rounded-xl bg-white shadow-sm p-4">
          {/* 手机:折叠开关(桌面隐藏) */}
          <button
            type="button"
            onClick={() => setFilterOpen((v) => !v)}
            className="flex w-full items-center justify-between text-sm text-gray-500 sm:hidden"
          >
            <span>筛选 / 搜索</span>
            <span>{filterOpen ? "收起 ▲" : "展开 ▾"}</span>
          </button>
          {/* 内容:手机折叠,桌面 sm:block 始终展开、布局不变 */}
          <div
            className={`${
              filterOpen ? "space-y-3" : "hidden"
            } sm:block sm:space-y-3`}
          >
          <FilterGroup label="市场">
            {MARKETS.map((m) => (
              <Chip key={m} active={market === m} onClick={() => setMarket(m)}>
                {m}
              </Chip>
            ))}
            <Chip active={onlyWatch} onClick={() => setOnlyWatch((v) => !v)}>
              ★ 只看自选{wl.codes.size ? `(${wl.codes.size})` : ""}
            </Chip>
          </FilterGroup>
          <FilterGroup label="位置">
            {POSITIONS.map((p) => (
              <Chip
                key={p}
                active={position === p}
                onClick={() => setPosition(p)}
              >
                {p}
              </Chip>
            ))}
          </FilterGroup>
          <FilterGroup label="梯队">
            {(["全部", "龙头", "二线"] as const).map((t) => (
              <Chip key={t} active={tier === t} onClick={() => setTier(t)}>
                {t}
              </Chip>
            ))}
          </FilterGroup>
          <FilterGroup label="关系">
            <Chip
              active={relation === "全部关系"}
              onClick={() => setRelation("全部关系")}
            >
              全部关系
            </Chip>
            {RELATION_TYPES.map((r) => (
              <Chip key={r} active={relation === r} onClick={() => setRelation(r)}>
                {r}
              </Chip>
            ))}
          </FilterGroup>
          <div className="flex flex-wrap items-center gap-3 pt-1">
            <div className="flex items-center gap-2">
              <span className="w-8 shrink-0 text-xs text-gray-400">板块</span>
              <select
                value={sector}
                onChange={(e) => setSector(e.target.value)}
                className="rounded-md border border-gray-300 bg-white px-2 py-1.5 text-sm outline-none focus:border-gray-900"
              >
                <option value="全部">全部({SECTORS.length})</option>
                {SECTORS.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex items-center gap-2">
              <span className="w-8 shrink-0 text-xs text-gray-400">概念</span>
              <select
                value={concept}
                onChange={(e) => setConcept(e.target.value)}
                className="max-w-[180px] rounded-md border border-gray-300 bg-white px-2 py-1.5 text-sm outline-none focus:border-gray-900"
              >
                <option value="全部">全部概念({CONCEPT_OPTIONS.length})</option>
                {CONCEPT_OPTIONS.map((c) => (
                  <option key={c} value={c}>
                    {c}({ALL_CONCEPTS[c]})
                  </option>
                ))}
              </select>
            </div>
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="搜索代码 / 公司 / 定位"
              className="min-w-[160px] flex-1 rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm outline-none focus:border-gray-900"
            />
          </div>
          </div>
        </div>
        </>
        )}

        {/* 主内容 */}
        {tab === "股票列表" && (
          <>
            <EtfStrip etfs={listEtfs} quotes={etfQuotes} wl={wl} />
            <StockTable rows={listRows} newsCodes={newsCodes} wl={wl} />
          </>
        )}
        {tab === "板块ETF" && (
          <EtfBoard
            onPickSector={(s) => {
              setSector(s);
              setMarket("全部");
              setTab("股票列表");
            }}
          />
        )}
        {tab === "关联图谱" && (
          <RelationMap rows={filtered} watchedCodes={wl.codes} />
        )}
        {tab === "特征矩阵" && <FeatureMatrix rows={filtered} />}
        {tab === "主动发现" && (
          <ActiveDiscovery rows={rows} watchedCodes={wl.codes} />
        )}

        <p className="mt-6 text-center text-xs text-gray-400">
          {DISCLAIMER}
        </p>
      </main>
    </div>
  );
}

function StatCard({
  label,
  value,
  tone,
  active,
  onClick,
}: {
  label: string;
  value: number;
  tone?: "up" | "down";
  active?: boolean;
  onClick?: () => void;
}) {
  const color =
    tone === "up"
      ? "text-rose-600"
      : tone === "down"
      ? "text-emerald-600"
      : "text-gray-900";
  const cls = `block w-full rounded-xl border bg-white px-4 py-3 text-left transition-colors ${
    active
      ? "border-gray-900 ring-1 ring-gray-900"
      : "border-gray-200 hover:border-gray-400"
  }`;
  const inner = (
    <>
      <div className="flex items-center gap-1 text-xs text-gray-400">
        {label}
        {active && <span className="text-gray-900">·筛选中</span>}
      </div>
      <div className={`mt-1 text-display font-semibold tabular-nums ${color}`}>
        {value}
      </div>
    </>
  );
  if (!onClick)
    return <div className="rounded-xl bg-white shadow-sm px-4 py-3">{inner}</div>;
  return (
    <button type="button" onClick={onClick} className={cls}>
      {inner}
    </button>
  );
}

function FilterGroup({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="w-8 shrink-0 text-xs text-gray-400">{label}</span>
      {children}
    </div>
  );
}

function Chip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
        active
          ? "bg-gray-900 text-white"
          : "bg-gray-100 text-gray-600 hover:bg-gray-200"
      }`}
    >
      {children}
    </button>
  );
}

/* ============ 股票列表(行可展开看「散户怎么想」) ============ */
function StockTable({
  rows,
  newsCodes,
  wl,
}: {
  rows: Stock[];
  newsCodes: Set<string>;
  wl: UseWatchlist;
}) {
  const [open, setOpen] = useState<Set<string>>(new Set());
  const toggle = (code: string) =>
    setOpen((prev) => {
      const next = new Set(prev);
      if (next.has(code)) next.delete(code);
      else next.add(code);
      return next;
    });

  // 点表头排序:数值列(价格/日涨跌)默认降序,文本列默认升序;非实时行情(live=false)沉底。
  const [sortKey, setSortKey] = useState<
    null | "code" | "name" | "market" | "position" | "sector" | "price" | "change"
  >(null);
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const toggleSort = (k: NonNullable<typeof sortKey>) => {
    if (sortKey === k) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else {
      setSortKey(k);
      setSortDir(k === "price" || k === "change" ? "desc" : "asc");
    }
  };
  const sortedRows = useMemo(() => {
    if (!sortKey) return rows;
    const isNum = sortKey === "price" || sortKey === "change";
    const numVal = (s: Stock) => (s.live ? (s[sortKey as "price" | "change"] as number) : null);
    const arr = [...rows];
    arr.sort((a, b) => {
      if (isNum) {
        const va = numVal(a);
        const vb = numVal(b);
        if (va === null && vb === null) return 0;
        if (va === null) return 1; // 无实时行情永远沉底
        if (vb === null) return -1;
        return sortDir === "asc" ? va - vb : vb - va;
      }
      const c = String(a[sortKey]).localeCompare(String(b[sortKey]), "zh");
      return sortDir === "asc" ? c : -c;
    });
    return arr;
  }, [rows, sortKey, sortDir]);

  const arrow = (k: NonNullable<typeof sortKey>) =>
    sortKey === k ? (sortDir === "asc" ? " ▲" : " ▼") : " ↕";

  // 长列表渐进加载:手机/桌面各一份(同时只显示一个视图)
  const mob = useProgressive(sortedRows, 12);
  const desk = useProgressive(sortedRows, 20);

  return (
    <>
      {/* 手机:卡片列表(桌面 sm 以上隐藏,不影响原表格) */}
      <div className="space-y-2 sm:hidden">
        {mob.slice.map((s) => (
          <StockCard
            key={s.code}
            s={s}
            hasNews={newsCodes.has(s.code)}
            watched={wl.has(s.code)}
            onToggleWatch={() => wl.toggle(s.code)}
            isOpen={open.has(s.code)}
            toggle={() => toggle(s.code)}
          />
        ))}
        {mob.hasMore && (
          <div
            ref={mob.setSentinel}
            className="py-3 text-center text-xs text-gray-400"
          >
            向下滚动加载更多 · {mob.shownCount}/{mob.total}
          </div>
        )}
        {rows.length === 0 && (
          <div className="rounded-xl bg-white shadow-sm px-4 py-12 text-center text-sm text-gray-400">
            没有符合条件的标的,试试放宽筛选条件
          </div>
        )}
      </div>

      {/* 桌面:原表格(手机隐藏) */}
      <div className="hidden overflow-hidden rounded-xl bg-white shadow-sm sm:block">
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
          <thead>
            <tr className="border-b border-gray-200 bg-gray-50 text-left text-xs text-gray-500">
              <Th></Th>
              <Th onClick={() => toggleSort("code")}>代码{arrow("code")}</Th>
              <Th onClick={() => toggleSort("name")}>公司{arrow("name")}</Th>
              <Th onClick={() => toggleSort("market")}>市场{arrow("market")}</Th>
              <Th onClick={() => toggleSort("position")}>位置{arrow("position")}</Th>
              <Th onClick={() => toggleSort("sector")}>板块{arrow("sector")}</Th>
              <Th className="text-right" onClick={() => toggleSort("price")}>
                价格{arrow("price")}
              </Th>
              <Th className="text-right" onClick={() => toggleSort("change")}>
                日涨跌{arrow("change")}
              </Th>
              <Th>核心定位</Th>
              <Th>状态</Th>
              <Th></Th>
            </tr>
          </thead>
          <tbody>
            {desk.slice.map((s) => {
              const isOpen = open.has(s.code);
              return (
                <ReactFragmentRow
                  key={s.code}
                  s={s}
                  hasNews={newsCodes.has(s.code)}
                  watched={wl.has(s.code)}
                  onToggleWatch={() => wl.toggle(s.code)}
                  isOpen={isOpen}
                  toggle={() => toggle(s.code)}
                />
              );
            })}
            {desk.hasMore && (
              <tr ref={desk.setSentinel}>
                <td
                  colSpan={11}
                  className="py-3 text-center text-xs text-gray-400"
                >
                  向下滚动加载更多 · {desk.shownCount}/{desk.total}
                </td>
              </tr>
            )}
            {rows.length === 0 && (
              <tr>
                <td
                  colSpan={11}
                  className="px-4 py-12 text-center text-sm text-gray-400"
                >
                  没有符合条件的标的,试试放宽筛选条件
                </td>
              </tr>
            )}
          </tbody>
          </table>
        </div>
      </div>
    </>
  );
}

/* ============ 股票卡片(移动端;桌面用 StockTable 表格) ============ */
function StockCard({
  s,
  hasNews,
  watched,
  onToggleWatch,
  isOpen,
  toggle,
}: {
  s: Stock;
  hasNews: boolean;
  watched: boolean;
  onToggleWatch: () => void;
  isOpen: boolean;
  toggle: () => void;
}) {
  const status: string = hasNews
    ? "今日有新消息"
    : s.status === "今日有新消息"
    ? "行情覆盖"
    : s.status;
  return (
    <div
      className={`rounded-xl border p-3 ${
        watched ? "border-amber-300 bg-amber-50/40" : "border-gray-200 bg-white"
      }`}
    >
      <div className="flex items-start gap-2">
        <button
          onClick={onToggleWatch}
          aria-label={watched ? "取消自选" : "加入自选"}
          className={`-m-2.5 inline-flex h-11 w-11 items-center justify-center text-lg leading-none ${
            watched ? "text-amber-400" : "text-gray-300"
          }`}
        >
          {watched ? "★" : "☆"}
        </button>
        <Link href={`/stock/${s.code}`} className="min-w-0 flex-1">
          <span className="font-medium text-gray-900">{s.name}</span>
          <TierTag code={s.code} />
          <WatchDot status={status} />{" "}
          <span className="font-mono text-xs text-gray-400">{s.code}</span>
        </Link>
        <div
          className={`shrink-0 text-right font-mono font-semibold tabular-nums ${liveChangeClass(
            s
          )}`}
        >
          {liveChange(s)}
          <div className="text-xs font-normal text-gray-400">{livePrice(s)}</div>
        </div>
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-1.5 text-xs">
        <span
          className={`rounded px-1.5 py-0.5 ${
            s.market === "美股"
              ? "bg-brand-50 text-brand-600"
              : "bg-red-50 text-red-600"
          }`}
        >
          {s.market}
        </span>
        <span
          className={`inline-flex rounded px-1.5 py-0.5 ${POSITION_BADGE[s.position]}`}
        >
          {s.position}
        </span>
        <span className="text-gray-500">{s.sector}</span>
        <StatusBadge status={status} className="ml-auto" />
      </div>
      <p className="mt-1.5 text-xs text-gray-600">{s.positioning}</p>
      {(CONCEPTS[s.code]?.length ?? 0) > 0 && (
        <div className="mt-1.5 flex flex-wrap gap-1">
          <ConceptChips code={s.code} />
        </div>
      )}
      <button
        onClick={toggle}
        className="mt-1.5 text-xs text-gray-400 hover:text-gray-600"
      >
        {isOpen ? "收起 ▲" : "散户怎么想 ▾"}
      </button>
      {isOpen && (
        <div className="mt-2 rounded-lg bg-amber-50/70 p-2.5">
          <p className="text-sm leading-relaxed text-gray-800">{s.retailTake}</p>
          <Link
            href={`/stock/${s.code}`}
            className="mt-1 inline-block text-xs text-brand-600"
          >
            查看完整详情 →
          </Link>
        </div>
      )}
    </div>
  );
}

function ReactFragmentRow({
  s,
  hasNews,
  watched,
  onToggleWatch,
  isOpen,
  toggle,
}: {
  s: Stock;
  hasNews: boolean;
  watched: boolean;
  onToggleWatch: () => void;
  isOpen: boolean;
  toggle: () => void;
}) {
  // 真实状态:今天进了简报才显示"今日有新消息";否则把种子里的假标降级
  const status: string = hasNews
    ? "今日有新消息"
    : s.status === "今日有新消息"
    ? "行情覆盖"
    : s.status;
  return (
    <>
      <tr
        onClick={toggle}
        className={`cursor-pointer border-b border-gray-100 ${
          watched ? "bg-amber-50/60 hover:bg-amber-100/50" : "hover:bg-gray-50"
        }`}
      >
        <Td className="pr-0 text-center">
          <button
            onClick={(e) => {
              e.stopPropagation();
              onToggleWatch();
            }}
            aria-label={watched ? "取消自选" : "加入自选"}
            title={watched ? "取消自选" : "加入自选"}
            className={`-m-2.5 inline-flex h-11 w-11 items-center justify-center text-base leading-none ${
              watched ? "text-amber-400" : "text-gray-300 hover:text-amber-400"
            }`}
          >
            {watched ? "★" : "☆"}
          </button>
        </Td>
        <Td className="font-mono text-xs text-gray-500">{s.code}</Td>
        <Td className="whitespace-nowrap font-medium text-gray-900">
          <Link
            href={`/stock/${s.code}`}
            onClick={(e) => e.stopPropagation()}
            className="hover:text-brand-600 hover:underline"
          >
            {s.name}
          </Link>
          <TierTag code={s.code} />
          <WatchDot status={status} />
        </Td>
        <Td>
          <span
            className={`rounded px-1.5 py-0.5 text-xs ${
              s.market === "美股"
                ? "bg-brand-50 text-brand-600"
                : "bg-red-50 text-red-600"
            }`}
          >
            {s.market}
          </span>
        </Td>
        <Td>
          <span
            className={`inline-flex rounded px-1.5 py-0.5 text-xs ${POSITION_BADGE[s.position]}`}
          >
            {s.position}
          </span>
        </Td>
        <Td className="whitespace-nowrap text-xs text-gray-500">{s.sector}</Td>
        <Td className="text-right font-mono tabular-nums text-gray-700">
          {livePrice(s)}
        </Td>
        <Td
          className={`text-right font-mono font-medium tabular-nums ${liveChangeClass(s)}`}
        >
          {liveChange(s)}
        </Td>
        <Td className="max-w-[260px] text-xs text-gray-600">
          {s.positioning}
          {(CONCEPTS[s.code]?.length ?? 0) > 0 && (
            <span className="mt-1 flex flex-wrap gap-1">
              <ConceptChips code={s.code} />
            </span>
          )}
        </Td>
        <Td>
          <StatusBadge status={status} />
        </Td>
        <Td className="whitespace-nowrap text-xs text-gray-400">
          {isOpen ? "收起 ▲" : "散户怎么想 ▾"}
        </Td>
      </tr>
      {isOpen && (
        <tr className="border-b border-gray-100 bg-amber-50/50">
          <td colSpan={11} className="px-4 py-3">
            <div className="flex gap-2">
              <span className="shrink-0 text-base">💡</span>
              <div>
                <p className="text-sm leading-relaxed text-gray-800">
                  {s.retailTake}
                </p>
                <Link
                  href={`/stock/${s.code}`}
                  className="mt-1 inline-block text-xs text-brand-600 hover:underline"
                >
                  查看完整详情 →
                </Link>
              </div>
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

/* ============ 关联图谱:美股 → A股 映射 ============ */
function RelationMap({
  rows,
  watchedCodes,
}: {
  rows: Stock[];
  watchedCodes: Set<string>;
}) {
  const codes = new Set(rows.map((r) => r.code));
  const byCode = new Map(rows.map((r) => [r.code, r]));
  const live = (s: Stock) => byCode.get(s.code) ?? s;
  const anchors = STOCKS.filter((s) => s.market === "美股").map((us) => ({
    us: live(us),
    peers: aSharePeers(us).map(live),
  }));
  const visible = anchors.filter(
    (a) => codes.has(a.us.code) || a.peers.some((p) => codes.has(p.code))
  );

  if (visible.length === 0)
    return <Empty text="当前筛选下没有可展示的关联关系" />;

  return (
    <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
      {visible
        .filter((a) => a.peers.length > 0)
        .map(({ us, peers }) => (
          <div
            key={us.code}
            className="rounded-xl bg-white shadow-sm p-4"
          >
            <div className="mb-3 flex items-center gap-2">
              <span className="rounded bg-brand-50 px-1.5 py-0.5 text-xs text-brand-600">
                美股
              </span>
              <Link
                href={`/stock/${us.code}`}
                className="font-medium text-gray-900 hover:text-brand-600"
              >
                {us.name}
              </Link>
              <span className="font-mono text-xs text-gray-400">{us.code}</span>
              <span
                className={`ml-auto font-mono text-sm tabular-nums ${liveChangeClass(us)}`}
              >
                {liveChange(us)}
              </span>
            </div>
            <div className="mb-2 text-xs text-gray-400">↓ 关联 A股</div>
            <div className="flex flex-wrap gap-2">
              {peers.map((p) => {
                const watched = watchedCodes.has(p.code);
                return (
                  <Link
                    key={p.code}
                    href={`/stock/${p.code}`}
                    title={watched ? "你的自选" : undefined}
                    className={`flex items-center gap-1.5 rounded-lg border px-2 py-1 text-sm ${
                      watched
                        ? "border-amber-300 bg-amber-50 hover:border-amber-400"
                        : "border-gray-200 hover:border-gray-400"
                    }`}
                  >
                    <span className="font-medium text-gray-800">
                      {watched && <span className="text-amber-500">★</span>}
                      {p.name}
                    </span>
                    <span
                      className={`font-mono text-xs tabular-nums ${liveChangeClass(p)}`}
                    >
                      {liveChange(p)}
                    </span>
                  </Link>
                );
              })}
            </div>
          </div>
        ))}
    </div>
  );
}

/* ============ 特征矩阵:板块 × 市场 涨跌热力 ============ */
function FeatureMatrix({ rows }: { rows: Stock[] }) {
  const data = SECTORS.map((sec) => {
    const inSec = rows.filter((r) => r.sector === sec);
    const us = inSec.filter((r) => r.market === "美股");
    const a = inSec.filter((r) => r.market === "A股");
    // 均值只用真实行情;没有 live 数据的板块给 null(显示"—"),不拿模拟值算热力
    const avg = (list: Stock[]) => {
      const ls = list.filter((r) => r.live);
      return ls.length
        ? ls.reduce((sum, r) => sum + r.change, 0) / ls.length
        : null;
    };
    return { sec, count: inSec.length, usAvg: avg(us), aAvg: avg(a) };
  }).filter((d) => d.count > 0);

  if (data.length === 0) return <Empty text="当前筛选下没有数据" />;

  return (
    <div className="overflow-hidden rounded-xl bg-white shadow-sm">
      <div className="overflow-x-auto">
      <table className="min-w-full text-sm">
        <thead>
          <tr className="border-b border-gray-200 bg-gray-50 text-left text-xs text-gray-500">
            <Th>板块</Th>
            <Th className="text-right">标的数</Th>
            <Th className="text-right">美股均涨跌</Th>
            <Th className="text-right">A股均涨跌</Th>
            <Th>强弱</Th>
          </tr>
        </thead>
        <tbody>
          {data.map((d) => (
            <tr key={d.sec} className="border-b border-gray-100 last:border-0">
              <Td className="whitespace-nowrap font-medium text-gray-800">
                {d.sec}
              </Td>
              <Td className="text-right tabular-nums text-gray-600">
                {d.count}
              </Td>
              <HeatCell value={d.usAvg} />
              <HeatCell value={d.aAvg} />
              <Td>
                <HeatBar value={d.aAvg ?? d.usAvg ?? 0} />
              </Td>
            </tr>
          ))}
        </tbody>
      </table>
      </div>
    </div>
  );
}

function HeatCell({ value }: { value: number | null }) {
  if (value === null)
    return <Td className="text-right text-xs text-gray-300">—</Td>;
  return (
    <Td className={`text-right font-mono tabular-nums ${changeClass(value)}`}>
      {fmtChange(value)}
    </Td>
  );
}

function HeatBar({ value }: { value: number }) {
  const pct = Math.min(Math.abs(value) / 6, 1) * 100;
  const color = value >= 0 ? "bg-rose-400" : "bg-emerald-400";
  return (
    <div className="h-2 w-24 overflow-hidden rounded-full bg-gray-100">
      <div className={`h-full ${color}`} style={{ width: `${pct}%` }} />
    </div>
  );
}

/* ============ 主动发现:预期差(美股涨了、A股还没跟上) ============ */
function ActiveDiscovery({
  rows,
  watchedCodes,
}: {
  rows: Stock[];
  watchedCodes: Set<string>;
}) {
  const GAP = 1.5; // 美股领先 A股 至少 1.5 个点才算预期差
  const map = new Map(rows.map((r) => [r.code, r]));

  // 只在真实行情上算预期差;行情未连接时不拿模拟数据编造信号
  const signals = rows
    .filter((s) => s.market === "美股" && s.live && s.change > 1)
    .map((us) => {
      const lagging = aSharePeers(us)
        .map((p) => map.get(p.code) ?? p)
        .filter((p) => p.live && us.change - p.change >= GAP);
      return { us, lagging };
    })
    .filter((x) => x.lagging.length > 0)
    .sort((a, b) => b.us.change - a.us.change);

  if (signals.length === 0)
    return (
      <Empty text="今日暂未发现明显联动差异(美股涨、对应 A 股已同步反应或行情未连接)" />
    );

  return (
    <div className="space-y-3">
      <div className="rounded-lg bg-amber-50 px-4 py-2 text-xs text-amber-700">
        ⚡ 联动差异:今天美股已涨、对应 A 股涨幅暂时落后的现象,仅供观察对比。注:历史规律不代表未来表现,不意味 A 股一定会补涨。
      </div>
      {signals.map(({ us, lagging }) => (
        <div
          key={us.code}
          className="rounded-xl bg-white shadow-sm p-4"
        >
          <div className="mb-2 flex items-center gap-2">
            <span className="text-base">⚡</span>
            <Link
              href={`/stock/${us.code}`}
              className="font-medium text-gray-900 hover:text-brand-600"
            >
              {us.name}
            </Link>
            <span className="text-sm text-gray-500">今日</span>
            <span className="font-mono text-sm font-medium text-rose-600">
              {fmtChange(us.change)}
            </span>
          </div>
          <div className="mb-1 text-xs text-gray-400">
            对应 A 股今日涨幅暂时落后的(仅供观察):
          </div>
          <div className="flex flex-wrap gap-2">
            {lagging.map((p) => {
              const watched = watchedCodes.has(p.code);
              return (
                <Link
                  key={p.code}
                  href={`/stock/${p.code}`}
                  title={watched ? "你的自选" : undefined}
                  className={`flex items-center gap-1.5 rounded-lg border bg-amber-50 px-2 py-1 text-sm ${
                    watched
                      ? "border-amber-400 ring-1 ring-amber-300 hover:border-amber-500"
                      : "border-amber-200 hover:border-amber-400"
                  }`}
                >
                  <span className="font-medium text-gray-800">
                    {watched && <span className="text-amber-500">★</span>}
                    {p.name}
                  </span>
                  <span
                    className={`font-mono text-xs tabular-nums ${changeClass(p.change)}`}
                  >
                    {fmtChange(p.change)}
                  </span>
                </Link>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}

function Empty({ text }: { text: string }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-gray-300 bg-white py-16 text-center">
      <div className="max-w-md text-sm text-gray-400">{text}</div>
    </div>
  );
}
