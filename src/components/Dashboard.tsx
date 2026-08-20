"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { SiteHeader } from "@/components/SiteHeader";
import { useWatchlist, type UseWatchlist } from "@/components/useWatchlist";
import { useProgressive } from "@/components/useProgressive";
import { useIsMobile } from "@/lib/useIsMobile";
import { ChainSwitcher } from "@/components/ChainSwitcher";
import { EtfBoard } from "@/components/EtfBoard";
import { EtfStrip } from "@/components/EtfStrip";
import { FeedbackLink } from "@/components/FeedbackLink";
import { TapBadge } from "@/components/TapBadge";
import { ETFS } from "@/data/etfs";
import { changeClass, fmtChange } from "@/lib/format";
import { Th, Td } from "@/components/Table";
import { DISCLAIMER } from "@/lib/constants";
import { REL_CHIP_CLS, relationTypeToDisplayBadge, strengthToRelationType, chainRouteId } from "@/lib/relation-rank";
import {
  STOCKS,
  aSharePeers,
  SECTORS,
  TIER,
  type Market,
  type Position,
  type Stock,
} from "@/data/stocks";
import { CONCEPTS } from "@/data/concepts.generated";
import { edgeInfo, type Strength } from "@/data/relations";
import { track } from "@/lib/analytics";
import { formatBeijingMDHM } from "@/lib/time-label";
import {
  type FundBehaviorItem,
  type FundBehaviorLabel,
} from "@/lib/fund-behavior";

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
          className="rounded bg-gray-100 px-1 py-0.5 text-[11px] text-gray-500 hover:bg-brand-50 hover:text-brand-600"
        >
          {c}
        </Link>
      ))}
    </>
  );
}

// 关系标(产业链地图主轴:直接/间接/情绪/弱映射,配色与全站关系标签同源)
function RelChip({ insight }: { insight?: StockInsight }) {
  if (!insight?.relation) return null;
  return (
    <span
      className={`ml-1 shrink-0 rounded px-1.5 py-0.5 text-[11px] font-medium ${
        REL_CHIP_CLS[insight.relation] ?? "bg-gray-100 text-gray-600"
      }`}
      title={insight.chainName ? `${insight.chainName} · ${insight.segment}` : insight.segment}
    >
      {insight.relation}
    </span>
  );
}

// 分流入口:查看链 / 查看 insight(把股票池分流到链页与因果链,不做终点)
function ChainLinks({ insight }: { insight?: StockInsight }) {
  if (!insight) return null;
  return (
    <span className="inline-flex flex-wrap items-center gap-x-3 gap-y-1">
      {insight.chainId && (
        <Link
          href={`/chain/${chainRouteId(insight.chainId)}`}
          onClick={(e) => e.stopPropagation()}
          className="text-xs font-medium text-brand-600 hover:underline"
        >
          查看链 →
        </Link>
      )}
      {insight.chainSlug && (
        <Link
          href={`/insight/${insight.chainSlug}`}
          onClick={(e) => e.stopPropagation()}
          className="text-xs font-medium text-brand-600 hover:underline"
        >
          看因果链 →
        </Link>
      )}
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

// 关联强弱标:强=真供货 中=对标/替代 弱=蹭概念;悬停看依据(basis)。
// 让散户在浏览"美股→A股"映射时一眼分清"真关联"和"蹭概念",别被弱关联割。
// Phase 3-B:边强度仅用于内部排序(真供货排前),不再作为展示徽章。StrengthTag 已退场。
const STRENGTH_RANK: Record<Strength, number> = { 强: 0, 中: 1, 弱: 2 };

// 历史同向率徽章(旧称联动有效率):过去2年该美股≥2%异动 → 次日A股同向且≥1% 的比例。小样本(<12)只给样本数、
// 不亮百分比;tooltip 明确"历史同向统计·非预测、历史不代表未来",守合规。数据来自 /api/linkage(边级缓存)。
type LinkageStat = {
  events: number;
  hits: number;
  rate: number;
  avgNext: number;
  windowYears: number;
  throughDate?: string;
};
const LINKAGE_MIN = 12;
function LinkageBadge({ stat }: { stat: LinkageStat | null | undefined }) {
  if (!stat) return null;
  if (stat.events < LINKAGE_MIN)
    return (
      <TapBadge
        label={`样本${stat.events}`}
        cls="bg-gray-100 text-gray-500"
        detail={`样本仅 ${stat.events} 次${stat.throughDate ? `,截至 ${stat.throughDate}` : ""},统计不足、仅供参考。历史同向统计·非预测,历史不代表未来。`}
      />
    );
  const pct = Math.round(stat.rate * 100);
  return (
    <TapBadge
      label={`同向${pct}%`}
      cls="bg-sky-50 text-sky-600"
      detail={`历史同向统计:过去2年${stat.throughDate ? `(截至 ${stat.throughDate})` : ""}该美股单日≥2%异动 → 次日A股同向且≥1% 的比例为 ${pct}%(样本${stat.events}次)。历史统计·非预测,历史不代表未来。`}
    />
  );
}

const TABS = ["股票列表", "板块ETF", "关联图谱", "特征矩阵", "主动发现"] as const;
type Tab = (typeof TABS)[number];

const MARKETS: ("全部" | Market)[] = ["全部", "美股", "A股"];
const POSITIONS: ("全部" | Position)[] = ["全部", "上游", "中游", "下游"];
// 关系筛选档 = 产业链关系档(与关系分布/relationResolver 同源,消双轨)
const CHAIN_REL_LABELS = ["直接映射", "间接映射", "情绪映射", "弱映射", "触发源", "待验证"] as const;

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

const FUND_BEHAVIOR_CLS: Record<FundBehaviorLabel, string> = {
  建仓特征: "bg-emerald-50 text-emerald-700",
  洗盘特征: "bg-amber-50 text-amber-700",
  抢筹特征: "bg-rose-50 text-rose-700",
  出货特征: "bg-orange-50 text-orange-700",
  衰竭特征: "bg-slate-100 text-slate-600",
  待判断: "bg-gray-100 text-gray-500",
};

const A_SHARE_CODES = STOCKS.filter((stock) => stock.market === "A股").map(
  (stock) => stock.code
);

function fundDateLabel(date: string | null): string {
  if (!date) return "";
  const [, month, day] = date.split("-");
  return month && day ? `${Number(month)}/${Number(day)}` : date;
}

function FundBehaviorBadge({
  item,
  date,
  loading = false,
}: {
  item?: FundBehaviorItem;
  date: string | null;
  loading?: boolean;
}) {
  if (!item) {
    return (
      <span className="whitespace-nowrap text-[11px] text-gray-300">
        {loading ? "加载中" : "—"}
      </span>
    );
  }
  const asOf = date ? `${fundDateLabel(date)} 收盘` : "最新收盘日";
  return (
    <TapBadge
      label={item.label}
      cls={FUND_BEHAVIOR_CLS[item.label]}
      detail={`${asOf} · ${item.reason}。${item.confidence}置信；仅为规则识别的资金形态，不代表机构真实意图或投资建议。`}
    />
  );
}

interface Quote {
  price: number;
  change: number;
}

// 产业链地图:每只票的核定关系/环节/reason/所属链(服务端 page.tsx 从 relationResolver 静态算好传入)。
export type StockInsight = {
  relation: string;
  segment: string;
  reason: string;
  chainSlug?: string;
  chainName: string;
  chainId?: string;
  chains?: string[]; // 该票所在全部链(链筛选用)
  segments?: { chainId: string; segmentId: string; segmentName: string }[]; // 所在环节(环节筛选用)
};
export type StockInsightMap = Record<string, StockInsight>;
export type ChainOpt = { chainId: string; chainName: string };

export default function Dashboard({
  insightMap = {},
  chains = [],
  segsByChain = {},
}: {
  insightMap?: StockInsightMap;
  chains?: ChainOpt[];
  segsByChain?: Record<string, { segmentId: string; segmentName: string }[]>;
}) {
  const [tab, setTab] = useState<Tab>("股票列表");
  const [market, setMarket] = useState<(typeof MARKETS)[number]>("全部");
  const [position, setPosition] = useState<(typeof POSITIONS)[number]>("全部");
  const [sector, setSector] = useState<string>("全部");
  const [tier, setTier] = useState<"全部" | "龙头" | "二线">("全部");
  const [concept, setConcept] = useState<string>("全部");
  const [relation, setRelation] = useState<string>("全部关系");
  const [chain, setChain] = useState<string>("全部"); // 产业链筛选(链→环节→关系,读 relationResolver)
  const [segment, setSegment] = useState<string>("全部"); // 环节筛选(依赖所选链)
  const [query, setQuery] = useState("");
  const [onlyWatch, setOnlyWatch] = useState(false);
  const [filterOpen, setFilterOpen] = useState(false); // 手机筛选区:默认折叠(桌面恒 sm:block 不受影响),首屏让位给股票列表
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
  const [newsGeneratedAt, setNewsGeneratedAt] = useState<string | null>(null);
  const [fundBehaviorMap, setFundBehaviorMap] = useState<
    Record<string, FundBehaviorItem>
  >({});
  const [fundBehaviorDate, setFundBehaviorDate] = useState<string | null>(null);
  const [fundBehaviorLoading, setFundBehaviorLoading] = useState(true);

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
      .then((d) => {
        setNewsCodes(new Set<string>(d.codes ?? []));
        setNewsGeneratedAt(d.generatedAt ?? null);
      })
      .catch(() => {});
  }, []);

  // 资金形态是收盘后日频判断,与 20 秒轮询的盘中行情分开取数,避免把不同时间口径混在一起。
  useEffect(() => {
    let active = true;
    fetch("/api/fund-behavior", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ codes: A_SHARE_CODES }),
    })
      .then((response) => response.json())
      .then((data) => {
        if (!active || !data.ok) return;
        const items = Array.isArray(data.items)
          ? (data.items as FundBehaviorItem[])
          : [];
        setFundBehaviorMap(
          Object.fromEntries(items.map((item) => [item.code, item]))
        );
        setFundBehaviorDate(data.date ?? null);
      })
      .catch(() => {})
      .finally(() => active && setFundBehaviorLoading(false));
    return () => {
      active = false;
    };
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

  // 除「市场」外的所有过滤(自选/环节/板块/梯队/概念/关系/搜索)。
  // 关联图谱、特征矩阵天生是美股↔A股对照,应吃这份"不按市场切"的数据,否则选 A股 时美股列全是"—"。
  // 一只票的产业链关系档(与关系分布同源):模型里有就取,美股未覆盖=触发源,A股/H股未覆盖=待验证。
  const chainRelOf = (code: string, mkt: string) =>
    insightMap[code]?.relation ?? (mkt === "美股" ? "触发源" : "待验证");

  const crossMarketRows = useMemo(() => {
    return rows.filter((s) => {
      if (onlyWatch && !wl.codes.has(s.code)) return false;
      if (position !== "全部" && s.position !== position) return false;
      if (sector !== "全部" && s.sector !== sector) return false;
      if (tier !== "全部" && TIER[s.code] !== tier) return false;
      if (concept !== "全部" && !(CONCEPTS[s.code] ?? []).includes(concept)) return false;
      // 产业链筛选(链 → 环节):读 relationResolver 传入的 insightMap
      if (chain !== "全部" && !insightMap[s.code]?.chains?.includes(chain)) return false;
      if (segment !== "全部" && !insightMap[s.code]?.segments?.some((sg) => sg.segmentId === segment))
        return false;
      // 关系筛选:改用产业链关系档(触发源/直接/间接/情绪/弱/待验证),与关系分布同源、消双轨
      if (relation !== "全部关系" && chainRelOf(s.code, s.market) !== relation) return false;
      if (query.trim()) {
        const q = query.trim().toLowerCase();
        const hay =
          `${s.code} ${s.name} ${s.positioning} ${s.sector} ${(CONCEPTS[s.code] ?? []).join(" ")}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, position, sector, tier, concept, chain, segment, relation, query, onlyWatch, wl.codes, insightMap]);

  // 股票列表用的最终集 = 跨市场集再叠加市场过滤。搜索时放开市场(否则默认锁 A股 搜美股=0 结果)。
  const filtered = useMemo(
    () =>
      crossMarketRows.filter(
        (s) => !!query.trim() || market === "全部" || s.market === market
      ),
    [crossMarketRows, market, query]
  );

  const stats = useMemo(() => {
    const coverage = filtered.filter((s) => s.live).length;
    // 涨跌只统计真实行情;行情未连接时不拿模拟值充数
    const up = filtered.filter((s) => s.live && s.change > 0).length;
    const down = filtered.filter((s) => s.live && s.change < 0).length;
    return { total: filtered.length, coverage, up, down };
  }, [filtered]);

  // 关系分布(比涨跌更符合产品定位:先看关系,再看行情)。
  // 美股是【事件触发源】不是 A 股映射标的 → 单列「触发源」,绝不混进「待验证」(否则用户
  // 误以为一堆 A 股映射没验证,拉低可信度)。待验证 = A股/H股 里尚未被 insight 核定关系的。
  const relDist = useMemo(() => {
    const d = { 触发源: 0, 直接映射: 0, 间接映射: 0, 情绪映射: 0, 弱映射: 0, 待验证: 0 };
    for (const s of filtered) {
      const rel = chainRelOf(s.code, s.market);
      if (rel in d) d[rel as keyof typeof d]++;
    }
    return d;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filtered, insightMap]);

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
                AI 产业链股票地图
              </h1>
              <FeedbackLink />
            </div>
            <p className="mt-1 max-w-2xl text-xs leading-relaxed text-gray-500">
              按产业链环节和关系强弱整理相关股票。这里不是推荐名单,而是帮你理解:谁是核心节点、谁是间接映射、谁只是情绪相关。数据来源于研究框架梳理 · 非确认关系 · 不构成投资建议。
            </p>
          </div>
          <div className="flex flex-col items-end gap-1 text-xs text-gray-500">
            <span className="flex items-center gap-1.5">
              <span
                className={`inline-block h-1.5 w-1.5 rounded-full ${
                  live ? "bg-emerald-500" : cached ? "bg-amber-400" : "bg-gray-300"
                }`}
              />
              {live
                ? `行情已连接 · 截至 ${fmtAsOf(quotesAsOf)} · 覆盖 ${stats.coverage}/${filtered.length}`
                : cached
                ? `行情未连接 · 显示截至 ${fmtAsOf(quotesAsOf)} 的缓存行情`
                : "行情未连接 · 暂无数据"}
            </span>
            {newsGeneratedAt && newsCodes.size > 0 && (
              <span className="text-meta text-gray-400">
                今日消息 · 盘前简报 {formatBeijingMDHM(newsGeneratedAt)}
              </span>
            )}
          </div>
        </div>

        {/* 产业链切换:AI 当前,其他「开发中」可投「我想要」 */}
        <ChainSwitcher />

        {/* Tab 导航:手机吸顶(长列表里随时切视图)+ 换行全露(不再横向溢出把「主动发现」切到屏外)*/}
        <div className="sticky top-0 z-20 -mx-4 mb-4 flex flex-wrap gap-1 border-b border-gray-200 bg-canvas px-4 sm:static sm:mx-0 sm:flex-nowrap sm:overflow-x-auto sm:px-0">
          {TABS.map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`-mb-px shrink-0 whitespace-nowrap border-b-2 px-3 py-2 text-sm transition-colors ${
                tab === t
                  ? "border-gray-900 font-medium text-gray-900"
                  : "border-transparent text-gray-500 hover:text-gray-800"
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

        {/* 关系分布(产品定位主轴:先看关系,再看行情) */}
        <div className="mb-2 rounded-xl bg-white px-4 py-3 shadow-sm">
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs">
            <span className="font-medium text-gray-500">关系分布</span>
            {([
              ["触发源", "text-brand-600"],
              ["直接映射", "text-rose-600"],
              ["间接映射", "text-amber-600"],
              ["情绪映射", "text-slate-500"],
              ["弱映射", "text-gray-500"],
              ["待验证", "text-gray-400"],
            ] as const).map(([k, cls]) => (
              <span key={k} className="inline-flex items-center gap-1">
                <span className="text-gray-500">{k}</span>
                <span className={`font-semibold tabular-nums ${cls}`}>
                  {relDist[k as keyof typeof relDist]}
                </span>
              </span>
            ))}
          </div>
          <p className="mt-1.5 text-[11px] leading-relaxed text-gray-400">
            美股多作为事件触发源,A 股 / H 股用于产业链映射;关系标签表示传导角色,不代表投资建议。先看关系,再看行情——涨跌只是当天市场表现,不代表产业链传导强弱。
            资金形态基于收盘后价格与资金数据的规则识别,最高为中置信,不代表机构真实意图。
          </p>
        </div>

        {/* 筛选区 */}
        <div className="mb-4 space-y-3 rounded-xl bg-white shadow-sm p-4">
          {/* 搜索:始终常驻——手机折叠筛选时也能直接搜票加自选(新手引导"在下方搜你拿的票"的落点)*/}
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="搜代码 / 公司 / 定位,点 ☆ 加自选"
            className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm outline-none focus:border-gray-900"
          />
          {/* 手机:筛选折叠开关(桌面隐藏) */}
          <button
            type="button"
            onClick={() => setFilterOpen((v) => !v)}
            className="flex w-full items-center justify-between text-sm text-gray-500 sm:hidden"
          >
            <span>筛选</span>
            <span>{filterOpen ? "收起 ▲" : "展开 ▾"}</span>
          </button>
          {/* 内容:手机折叠,桌面 sm:block 始终展开、布局不变 */}
          <div
            className={`${
              filterOpen ? "space-y-3" : "hidden"
            } sm:block sm:space-y-3`}
          >
          {chains.length > 0 && (
            <FilterGroup label="产业链">
              <Chip
                active={chain === "全部"}
                onClick={() => {
                  setChain("全部");
                  setSegment("全部");
                }}
              >
                全部
              </Chip>
              {chains.map((c) => (
                <Chip
                  key={c.chainId}
                  active={chain === c.chainId}
                  onClick={() => {
                    setChain(c.chainId);
                    setSegment("全部");
                    // 2.2-C 商业化漏斗:链筛选使用率=「用户最常看哪条链」的直接信号
                    track("stocks_filter_use", { kind: "chain", chain_id: c.chainId });
                  }}
                >
                  {c.chainName.replace("基础设施链", "")}
                </Chip>
              ))}
            </FilterGroup>
          )}
          {chain !== "全部" && (segsByChain[chain]?.length ?? 0) > 0 && (
            <FilterGroup label="环节">
              <Chip active={segment === "全部"} onClick={() => setSegment("全部")}>
                全部环节
              </Chip>
              {segsByChain[chain].map((sg) => (
                <Chip
                  key={sg.segmentId}
                  active={segment === sg.segmentId}
                  onClick={() => {
                    setSegment(sg.segmentId);
                    track("stocks_filter_use", { kind: "segment", chain_id: chain, segment: sg.segmentId });
                  }}
                >
                  {sg.segmentName}
                </Chip>
              ))}
            </FilterGroup>
          )}
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
          {/* 梯队(龙头/二线)已下线:StockTell 不以"龙头/二线"作核心判断,关系分级才是主轴 */}
          <FilterGroup label="关系">
            <Chip
              active={relation === "全部关系"}
              onClick={() => setRelation("全部关系")}
            >
              全部关系
            </Chip>
            {CHAIN_REL_LABELS.map((r) => (
              <Chip key={r} active={relation === r} onClick={() => setRelation(r)}>
                {r}
              </Chip>
            ))}
          </FilterGroup>
          <div className="flex flex-wrap items-center gap-3 pt-1">
            <div className="flex items-center gap-2">
              <span className="w-8 shrink-0 text-xs text-gray-500">板块</span>
              <select
                value={sector}
                onChange={(e) => setSector(e.target.value)}
                className="min-h-[44px] rounded-md border border-gray-300 bg-white px-2 py-1.5 text-sm outline-none focus:border-gray-900 sm:min-h-0"
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
              <span className="w-8 shrink-0 text-xs text-gray-500">概念</span>
              <select
                value={concept}
                onChange={(e) => setConcept(e.target.value)}
                className="min-h-[44px] max-w-[180px] rounded-md border border-gray-300 bg-white px-2 py-1.5 text-sm outline-none focus:border-gray-900 sm:min-h-0"
              >
                <option value="全部">全部概念({CONCEPT_OPTIONS.length})</option>
                {CONCEPT_OPTIONS.map((c) => (
                  <option key={c} value={c}>
                    {c}({ALL_CONCEPTS[c]})
                  </option>
                ))}
              </select>
            </div>
          </div>
          </div>
        </div>
        </>
        )}

        {/* 主内容 */}
        {tab === "股票列表" && (
          <>
            <EtfStrip etfs={listEtfs} quotes={etfQuotes} wl={wl} />
            <StockTable
              rows={listRows}
              newsCodes={newsCodes}
              wl={wl}
              insightMap={insightMap}
              fundBehaviorMap={fundBehaviorMap}
              fundBehaviorDate={fundBehaviorDate}
              fundBehaviorLoading={fundBehaviorLoading}
            />
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
          <RelationMap rows={crossMarketRows} watchedCodes={wl.codes} insightMap={insightMap} />
        )}
        {tab === "特征矩阵" && <FeatureMatrix rows={crossMarketRows} />}
        {tab === "主动发现" && (
          <ActiveDiscovery rows={rows} watchedCodes={wl.codes} insightMap={insightMap} />
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
      className={`inline-flex min-h-[36px] items-center rounded-full px-3 py-1.5 text-sm font-medium transition-colors sm:min-h-0 sm:py-1 sm:text-xs ${
        active
          ? "bg-gray-900 text-white"
          : "bg-gray-100 text-gray-600 hover:bg-gray-200"
      }`}
    >
      {children}
    </button>
  );
}

/* ============ 股票列表(行可展开看「为什么在这条链里」) ============ */
function StockTable({
  rows,
  newsCodes,
  wl,
  insightMap,
  fundBehaviorMap,
  fundBehaviorDate,
  fundBehaviorLoading,
}: {
  rows: Stock[];
  newsCodes: Set<string>;
  wl: UseWatchlist;
  insightMap: StockInsightMap;
  fundBehaviorMap: Record<string, FundBehaviorItem>;
  fundBehaviorDate: string | null;
  fundBehaviorLoading: boolean;
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
  // 单树渲染:首帧(未挂载,isMobile=null)两套都渲染、靠 CSS 显隐(SSR 安全、静态可缓存、不闪);
  // 挂载后 matchMedia 定值 → 只保留命中的一套,给移动端减 DOM。
  const isMobile = useIsMobile();
  const known = isMobile !== null; // 已定后 JS 权威:渲染的那棵去掉响应式隐藏类
  const showMobile = isMobile === null || isMobile;
  const showDesktop = isMobile === null || !isMobile;

  return (
    <>
      {/* 手机:卡片列表(桌面 sm 以上隐藏,不影响原表格) */}
      {showMobile && (
      <div className={`space-y-2${known ? "" : " sm:hidden"}`}>
        {mob.slice.map((s) => (
          <StockCard
            key={s.code}
            s={s}
            insight={insightMap[s.code]}
            hasNews={newsCodes.has(s.code)}
            watched={wl.has(s.code)}
            onToggleWatch={() => wl.toggle(s.code)}
            isOpen={open.has(s.code)}
            toggle={() => toggle(s.code)}
            fundBehavior={fundBehaviorMap[s.code]}
            fundBehaviorDate={fundBehaviorDate}
            fundBehaviorLoading={fundBehaviorLoading && s.market === "A股"}
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
            没有符合条件的标的。可放宽筛选;若按链 / 环节筛选,该环节可能暂无纳入静态关系的标的(仅有「待验证」标的、尚未核定)。
          </div>
        )}
      </div>
      )}

      {/* 桌面:原表格(手机隐藏) */}
      {showDesktop && (
      <div
        className={`overflow-hidden rounded-xl bg-white shadow-sm ${
          known ? "block" : "hidden sm:block"
        }`}
      >
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
              <Th>
                <span title="基于同一收盘日的价格、资金强度与近 3 日连续性识别">
                  资金形态
                </span>
                {fundBehaviorDate && (
                  <span className="block text-[10px] font-normal text-gray-400">
                    {fundDateLabel(fundBehaviorDate)} 收盘
                  </span>
                )}
              </Th>
              <Th>为什么在这条链里</Th>
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
                  insight={insightMap[s.code]}
                  hasNews={newsCodes.has(s.code)}
                  watched={wl.has(s.code)}
                  onToggleWatch={() => wl.toggle(s.code)}
                  isOpen={isOpen}
                  toggle={() => toggle(s.code)}
                  fundBehavior={fundBehaviorMap[s.code]}
                  fundBehaviorDate={fundBehaviorDate}
                  fundBehaviorLoading={fundBehaviorLoading && s.market === "A股"}
                />
              );
            })}
            {desk.hasMore && (
              <tr ref={desk.setSentinel}>
                <td
                  colSpan={12}
                  className="py-3 text-center text-xs text-gray-400"
                >
                  向下滚动加载更多 · {desk.shownCount}/{desk.total}
                </td>
              </tr>
            )}
            {rows.length === 0 && (
              <tr>
                <td
                  colSpan={12}
                  className="px-4 py-12 text-center text-sm text-gray-400"
                >
                  没有符合条件的标的。可放宽筛选;若按链 / 环节筛选,该环节可能暂无纳入静态关系的标的(仅有「待验证」标的、尚未核定)。
                </td>
              </tr>
            )}
          </tbody>
          </table>
        </div>
      </div>
      )}
    </>
  );
}

/* ============ 股票卡片(移动端;桌面用 StockTable 表格) ============ */
function StockCard({
  s,
  insight,
  hasNews,
  watched,
  onToggleWatch,
  isOpen,
  toggle,
  fundBehavior,
  fundBehaviorDate,
  fundBehaviorLoading,
}: {
  s: Stock;
  insight?: StockInsight;
  hasNews: boolean;
  watched: boolean;
  onToggleWatch: () => void;
  isOpen: boolean;
  toggle: () => void;
  fundBehavior?: FundBehaviorItem;
  fundBehaviorDate: string | null;
  fundBehaviorLoading: boolean;
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
          title={watched ? "取消自选" : "加入自选"}
          className={`-m-2.5 inline-flex h-11 w-11 shrink-0 items-center justify-center text-lg leading-none ${
            watched ? "text-amber-400" : "text-gray-300"
          }`}
        >
          {watched ? "★" : "☆"}
        </button>
        <Link href={`/stock/${s.code}`} className="min-w-0 flex-1">
          <span className="font-medium text-gray-900">{s.name}</span>
          <RelChip insight={insight} />
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
        {s.market === "A股" && (
          <FundBehaviorBadge
            item={fundBehavior}
            date={fundBehaviorDate}
            loading={fundBehaviorLoading}
          />
        )}
        <StatusBadge status={status} className="ml-auto" />
      </div>
      <p className="mt-1.5 text-xs leading-relaxed text-gray-600">
        {insight?.segment && (
          <span className="mr-1 rounded bg-gray-100 px-1 py-0.5 text-[10px] text-gray-500">
            {insight.segment}
          </span>
        )}
        {insight?.reason || s.positioning}
      </p>
      {(CONCEPTS[s.code]?.length ?? 0) > 0 && (
        <div className="mt-1.5 flex flex-wrap gap-1">
          <ConceptChips code={s.code} />
        </div>
      )}
      <button
        onClick={toggle}
        className="mt-1.5 text-xs text-gray-400 hover:text-gray-600"
      >
        {isOpen ? "收起 ▲" : "为什么在这条链里 ▾"}
      </button>
      {isOpen && (
        <div className="mt-2 rounded-lg bg-amber-50/70 p-2.5">
          <p className="text-sm leading-relaxed text-gray-800">{s.retailTake}</p>
          <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1">
            <ChainLinks insight={insight} />
            <Link
              href={`/stock/${s.code}`}
              className="text-xs font-medium text-brand-600"
            >
              个股详情 →
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}

function ReactFragmentRow({
  s,
  insight,
  hasNews,
  watched,
  onToggleWatch,
  isOpen,
  toggle,
  fundBehavior,
  fundBehaviorDate,
  fundBehaviorLoading,
}: {
  s: Stock;
  insight?: StockInsight;
  hasNews: boolean;
  watched: boolean;
  onToggleWatch: () => void;
  isOpen: boolean;
  toggle: () => void;
  fundBehavior?: FundBehaviorItem;
  fundBehaviorDate: string | null;
  fundBehaviorLoading: boolean;
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
          <RelChip insight={insight} />
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
        <Td className="whitespace-nowrap">
          <FundBehaviorBadge
            item={fundBehavior}
            date={fundBehaviorDate}
            loading={fundBehaviorLoading}
          />
        </Td>
        <Td className="max-w-[340px] text-xs text-gray-600">
          {insight?.segment && (
            <span className="mr-1 rounded bg-gray-100 px-1 py-0.5 text-[10px] text-gray-500">
              {insight.segment}
            </span>
          )}
          {/* 有 insight 核定 reason 就用它(位置+为什么+验证),否则退回定位标签 */}
          {insight?.reason || s.positioning}
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
          {isOpen ? "收起 ▲" : "为什么在这条链里 ▾"}
        </Td>
      </tr>
      {isOpen && (
        <tr className="border-b border-gray-100 bg-amber-50/50">
          <td colSpan={12} className="px-4 py-3">
            <div className="flex gap-2">
              <span className="shrink-0 text-base">💡</span>
              <div>
                <p className="text-sm leading-relaxed text-gray-800">
                  {s.retailTake}
                </p>
                <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1">
                  <ChainLinks insight={insight} />
                  <Link
                    href={`/stock/${s.code}`}
                    onClick={(e) => e.stopPropagation()}
                    className="text-xs font-medium text-brand-600 hover:underline"
                  >
                    个股详情 →
                  </Link>
                </div>
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
  insightMap,
}: {
  rows: Stock[];
  watchedCodes: Set<string>;
  insightMap: StockInsightMap;
}) {
  const [directOnly, setDirectOnly] = useState(false);
  const codes = new Set(rows.map((r) => r.code));
  const byCode = new Map(rows.map((r) => [r.code, r]));
  const live = (s: Stock) => byCode.get(s.code) ?? s;
  // Phase 3-B:每个 A 股 peer 读 relationType(退强/中/弱);无则 strength→relationType fallback。排序仍按边强度(内部)。
  const relLabelOf = (code: string, strength: Strength) =>
    insightMap[code]?.relation ?? relationTypeToDisplayBadge(strengthToRelationType(strength)).label;
  const anchors = STOCKS.filter((s) => s.market === "美股").map((us) => ({
    us: live(us),
    peers: aSharePeers(us)
      .map((p) => {
        const strength = (edgeInfo(us.code, p.code)?.strength ?? "弱") as Strength;
        return { p: live(p), strength, relLabel: relLabelOf(p.code, strength) };
      })
      .sort((a, b) => STRENGTH_RANK[a.strength] - STRENGTH_RANK[b.strength]),
  }));
  const visible = anchors.filter(
    (a) => codes.has(a.us.code) || a.peers.some((x) => codes.has(x.p.code))
  );
  // 仅看直接映射:过滤到只剩 relationType=直接映射 的 peer,丢掉过滤后为空的锚点
  const cards = visible
    .map(({ us, peers }) => ({
      us,
      peers: directOnly ? peers.filter((x) => x.relLabel === "直接映射") : peers,
    }))
    .filter((a) => a.peers.length > 0);

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center gap-x-3 gap-y-1.5 text-xs">
        <button
          onClick={() =>
            setDirectOnly((v) => {
              if (!v) track("relation_direct_only");
              return !v;
            })
          }
          className={`rounded-full px-2.5 py-1 font-medium ${
            directOnly
              ? "bg-rose-600 text-white"
              : "bg-white text-gray-500 shadow-sm hover:text-gray-800"
          }`}
        >
          {directOnly ? "✓ 仅看直接映射" : "仅看直接映射"}
        </button>
        <span className="text-gray-500">
          关系档:<span className="text-rose-600">直接映射</span> · <span className="text-amber-600">间接映射</span> ·{" "}
          <span className="text-slate-500">情绪映射</span> · 弱映射 · 待验证(点徽章看依据)
        </span>
      </div>
      {cards.length === 0 ? (
        <Empty
          text={
            directOnly
              ? "当前筛选下没有直接映射关系,试试关掉「仅看直接映射」"
              : "当前筛选下没有可展示的关联关系"
          }
        />
      ) : (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          {cards.map(({ us, peers }) => (
            <div key={us.code} className="rounded-xl bg-white shadow-sm p-4">
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
                {peers.map(({ p, relLabel }) => {
                  const watched = watchedCodes.has(p.code);
                  return (
                    <Link
                      key={p.code}
                      href={`/stock/${p.code}`}
                      className={`flex items-center gap-1.5 rounded-lg border px-2 py-1 text-sm ${
                        watched
                          ? "border-amber-300 bg-amber-50 hover:border-amber-400"
                          : "border-gray-200 hover:border-gray-400"
                      }`}
                    >
                      <TapBadge
                        label={relLabel}
                        cls={REL_CHIP_CLS[relLabel] ?? "bg-gray-100 text-gray-600"}
                        detail={`${relLabel} · ${edgeInfo(us.code, p.code)?.basis ?? "—"}`}
                      />
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
      )}
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
  insightMap,
}: {
  rows: Stock[];
  watchedCodes: Set<string>;
  insightMap: StockInsightMap;
}) {
  const [linkage, setLinkage] = useState<Record<string, LinkageStat | null>>({});
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

  // 拉历史同向率(边级、天内不变,服务端缓存 6h),给每条落后边打"联动N%"徽章
  const pairsKey = signals
    .flatMap((s) => s.lagging.map((p) => `${s.us.code}:${p.code}`))
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
                  onClick={() =>
                    track("predict_diff_click", {
                      us: us.code,
                      a: p.code,
                      strength: edgeInfo(us.code, p.code)?.strength ?? "弱",
                    })
                  }
                  className={`flex items-center gap-1.5 rounded-lg border bg-amber-50 px-2 py-1 text-sm ${
                    watched
                      ? "border-amber-400 ring-1 ring-amber-300 hover:border-amber-500"
                      : "border-amber-200 hover:border-amber-400"
                  }`}
                >
                  {(() => {
                    const rl = insightMap[p.code]?.relation ?? relationTypeToDisplayBadge(strengthToRelationType(edgeInfo(us.code, p.code)?.strength ?? "弱")).label;
                    return <span className={`shrink-0 rounded px-1.5 py-0.5 text-[11px] font-medium ${REL_CHIP_CLS[rl] ?? "bg-gray-100 text-gray-600"}`}>{rl}</span>;
                  })()}
                  <LinkageBadge stat={linkage[`${us.code}:${p.code}`]} />
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
