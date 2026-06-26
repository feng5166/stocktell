"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { AuthStatus } from "@/components/auth/AuthStatus";
import {
  STOCKS,
  aSharePeers,
  SECTORS,
  RELATION_TYPES,
  type Market,
  type Position,
  type Stock,
} from "@/data/stocks";

const TABS = ["股票列表", "关联图谱", "特征矩阵", "主动发现"] as const;
type Tab = (typeof TABS)[number];

const MARKETS: ("全部" | Market)[] = ["全部", "美股", "A股"];
const POSITIONS: ("全部" | Position)[] = ["全部", "上游", "中游", "下游"];

// A股惯例:红涨绿跌
function changeClass(change: number) {
  if (change > 0) return "text-rose-600";
  if (change < 0) return "text-emerald-600";
  return "text-gray-400";
}
function fmtChange(change: number) {
  const sign = change > 0 ? "+" : "";
  return `${sign}${change.toFixed(2)}%`;
}

const POSITION_BADGE: Record<Position, string> = {
  上游: "bg-sky-50 text-sky-700 ring-sky-600/20",
  中游: "bg-violet-50 text-violet-700 ring-violet-600/20",
  下游: "bg-amber-50 text-amber-700 ring-amber-600/20",
};

const STATUS_BADGE: Record<string, string> = {
  今日有新消息: "bg-rose-50 text-rose-600 ring-rose-600/20",
  行情覆盖: "bg-gray-100 text-gray-600 ring-gray-500/20",
  长期观察: "bg-gray-50 text-gray-400 ring-gray-400/20",
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
  const [relation, setRelation] = useState<string>("全部关系");
  const [query, setQuery] = useState("");

  const [quotes, setQuotes] = useState<Record<string, Quote>>({});
  const [live, setLive] = useState(false);
  const [newsCodes, setNewsCodes] = useState<Set<string>>(new Set());

  // 今日简报涉及的标的 = 真实"今日有新消息"
  useEffect(() => {
    fetch("/api/briefing/news", { cache: "no-store" })
      .then((r) => r.json())
      .then((d) => setNewsCodes(new Set<string>(d.codes ?? [])))
      .catch(() => {});
  }, []);

  // 轮询真实行情;拿不到则继续用模拟数据
  useEffect(() => {
    let active = true;
    async function load() {
      try {
        const r = await fetch("/api/quotes", { cache: "no-store" });
        const data = await r.json();
        if (!active) return;
        setQuotes(data.quotes ?? {});
        setLive(Boolean(data.live));
      } catch {
        /* 静默回退到模拟数据 */
      }
    }
    load();
    const t = setInterval(load, 20000);
    return () => {
      active = false;
      clearInterval(t);
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
      if (market !== "全部" && s.market !== market) return false;
      if (position !== "全部" && s.position !== position) return false;
      if (sector !== "全部" && s.sector !== sector) return false;
      if (
        relation !== "全部关系" &&
        !(s.relationTypes as readonly string[]).includes(relation)
      )
        return false;
      if (query.trim()) {
        const q = query.trim().toLowerCase();
        const hay =
          `${s.code} ${s.name} ${s.positioning} ${s.sector}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [rows, market, position, sector, relation, query]);

  const stats = useMemo(() => {
    const coverage = filtered.filter((s) => s.live).length;
    const up = filtered.filter((s) => s.change > 0).length;
    const down = filtered.filter((s) => s.change < 0).length;
    return { total: filtered.length, coverage, up, down };
  }, [filtered]);

  return (
    <div className="min-h-screen bg-[#f7f8fa] text-[#1a1d24]">
      <header className="border-b border-gray-200 bg-white">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-3 sm:px-6">
          <div className="flex items-center gap-2">
            <span className="text-lg font-bold tracking-tight">StockTell</span>
            <span className="hidden text-xs text-gray-400 sm:inline">
              我不懂产业链,你告诉我怎么想
            </span>
          </div>
          <nav className="flex items-center gap-4 text-sm text-gray-500">
            <Link href="/" className="hidden hover:text-gray-900 sm:inline">
              今日简报
            </Link>
            <span className="cursor-default font-medium text-gray-900">
              股票池
            </span>
            <AuthStatus />
          </nav>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6">
        <div className="mb-4 flex flex-wrap items-end justify-between gap-2">
          <div>
            <h1 className="text-xl font-semibold tracking-tight">
              AI产业链股票池
            </h1>
            <p className="mt-1 text-xs text-gray-400">
              数据来源于研究框架梳理 · 非确认的客户/供应商/持仓关系 ·
              不构成投资建议
            </p>
          </div>
          <div className="flex items-center gap-1.5 text-xs text-gray-400">
            <span
              className={`inline-block h-1.5 w-1.5 rounded-full ${
                live ? "bg-emerald-500" : "bg-gray-300"
              }`}
            />
            {live
              ? `行情已连接 · 覆盖 ${stats.coverage}/${filtered.length}`
              : "行情连接中(暂用模拟数据)"}
          </div>
        </div>

        {/* Tab 导航 */}
        <div className="mb-4 flex gap-1 border-b border-gray-200">
          {TABS.map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`-mb-px border-b-2 px-3 py-2 text-sm transition-colors ${
                tab === t
                  ? "border-gray-900 font-medium text-gray-900"
                  : "border-transparent text-gray-400 hover:text-gray-700"
              }`}
            >
              {t}
            </button>
          ))}
        </div>

        {/* 统计面板 */}
        <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <StatCard label="当前标的" value={stats.total} />
          <StatCard label="行情覆盖" value={stats.coverage} />
          <StatCard label="上涨标的" value={stats.up} tone="up" />
          <StatCard label="下跌标的" value={stats.down} tone="down" />
        </div>

        {/* 筛选区 */}
        <div className="mb-4 space-y-3 rounded-xl border border-gray-200 bg-white p-4">
          <FilterGroup label="市场">
            {MARKETS.map((m) => (
              <Chip key={m} active={market === m} onClick={() => setMarket(m)}>
                {m}
              </Chip>
            ))}
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
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="搜索代码 / 公司 / 定位"
              className="min-w-[180px] flex-1 rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm outline-none focus:border-gray-900"
            />
          </div>
        </div>

        {/* 主内容 */}
        {tab === "股票列表" && (
          <StockTable rows={filtered} newsCodes={newsCodes} />
        )}
        {tab === "关联图谱" && <RelationMap rows={filtered} />}
        {tab === "特征矩阵" && <FeatureMatrix rows={filtered} />}
        {tab === "主动发现" && <ActiveDiscovery rows={rows} />}

        <p className="mt-6 text-center text-xs text-gray-400">
          以上内容为信息整理,不构成投资建议。历史规律不代表未来表现。
        </p>
      </main>
    </div>
  );
}

function StatCard({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone?: "up" | "down";
}) {
  const color =
    tone === "up"
      ? "text-rose-600"
      : tone === "down"
      ? "text-emerald-600"
      : "text-gray-900";
  return (
    <div className="rounded-xl border border-gray-200 bg-white px-4 py-3">
      <div className="text-xs text-gray-400">{label}</div>
      <div className={`mt-1 text-2xl font-semibold tabular-nums ${color}`}>
        {value}
      </div>
    </div>
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
}: {
  rows: Stock[];
  newsCodes: Set<string>;
}) {
  const [open, setOpen] = useState<Set<string>>(new Set());
  const toggle = (code: string) =>
    setOpen((prev) => {
      const next = new Set(prev);
      if (next.has(code)) next.delete(code);
      else next.add(code);
      return next;
    });

  return (
    <div className="overflow-hidden rounded-xl border border-gray-200 bg-white">
      <div className="overflow-x-auto">
        <table className="min-w-full text-sm">
          <thead>
            <tr className="border-b border-gray-200 bg-gray-50 text-left text-xs text-gray-500">
              <Th>代码</Th>
              <Th>公司</Th>
              <Th>市场</Th>
              <Th>位置</Th>
              <Th>板块</Th>
              <Th className="text-right">价格</Th>
              <Th className="text-right">日涨跌</Th>
              <Th>核心定位</Th>
              <Th>状态</Th>
              <Th></Th>
            </tr>
          </thead>
          <tbody>
            {rows.map((s) => {
              const isOpen = open.has(s.code);
              return (
                <ReactFragmentRow
                  key={s.code}
                  s={s}
                  hasNews={newsCodes.has(s.code)}
                  isOpen={isOpen}
                  toggle={() => toggle(s.code)}
                />
              );
            })}
            {rows.length === 0 && (
              <tr>
                <td
                  colSpan={10}
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
  );
}

function ReactFragmentRow({
  s,
  hasNews,
  isOpen,
  toggle,
}: {
  s: Stock;
  hasNews: boolean;
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
        className="cursor-pointer border-b border-gray-100 hover:bg-gray-50"
      >
        <Td className="font-mono text-xs text-gray-500">{s.code}</Td>
        <Td className="whitespace-nowrap font-medium text-gray-900">
          <Link
            href={`/stock/${s.code}`}
            onClick={(e) => e.stopPropagation()}
            className="hover:text-blue-600 hover:underline"
          >
            {s.name}
          </Link>
        </Td>
        <Td>
          <span
            className={`rounded px-1.5 py-0.5 text-xs ${
              s.market === "美股"
                ? "bg-blue-50 text-blue-600"
                : "bg-red-50 text-red-600"
            }`}
          >
            {s.market}
          </span>
        </Td>
        <Td>
          <span
            className={`inline-flex rounded px-1.5 py-0.5 text-xs ring-1 ring-inset ${POSITION_BADGE[s.position]}`}
          >
            {s.position}
          </span>
        </Td>
        <Td className="whitespace-nowrap text-xs text-gray-500">{s.sector}</Td>
        <Td className="text-right font-mono tabular-nums text-gray-700">
          {s.price.toFixed(2)}
        </Td>
        <Td
          className={`text-right font-mono font-medium tabular-nums ${changeClass(s.change)}`}
        >
          {fmtChange(s.change)}
        </Td>
        <Td className="max-w-[260px] text-xs text-gray-600">{s.positioning}</Td>
        <Td>
          <span
            className={`inline-flex whitespace-nowrap rounded px-1.5 py-0.5 text-xs ring-1 ring-inset ${
              STATUS_BADGE[status] ?? STATUS_BADGE["长期观察"]
            }`}
          >
            {status}
          </span>
        </Td>
        <Td className="whitespace-nowrap text-xs text-gray-400">
          {isOpen ? "收起 ▲" : "散户怎么想 ▾"}
        </Td>
      </tr>
      {isOpen && (
        <tr className="border-b border-gray-100 bg-amber-50/50">
          <td colSpan={10} className="px-4 py-3">
            <div className="flex gap-2">
              <span className="shrink-0 text-base">💡</span>
              <div>
                <p className="text-sm leading-relaxed text-gray-800">
                  {s.retailTake}
                </p>
                <Link
                  href={`/stock/${s.code}`}
                  className="mt-1 inline-block text-xs text-blue-600 hover:underline"
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

function Th({
  children,
  className = "",
}: {
  children?: React.ReactNode;
  className?: string;
}) {
  return (
    <th className={`whitespace-nowrap px-3 py-2 font-medium ${className}`}>
      {children}
    </th>
  );
}

function Td({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return <td className={`px-3 py-2.5 align-top ${className}`}>{children}</td>;
}

/* ============ 关联图谱:美股 → A股 映射 ============ */
function RelationMap({ rows }: { rows: Stock[] }) {
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
            className="rounded-xl border border-gray-200 bg-white p-4"
          >
            <div className="mb-3 flex items-center gap-2">
              <span className="rounded bg-blue-50 px-1.5 py-0.5 text-xs text-blue-600">
                美股
              </span>
              <Link
                href={`/stock/${us.code}`}
                className="font-medium text-gray-900 hover:text-blue-600"
              >
                {us.name}
              </Link>
              <span className="font-mono text-xs text-gray-400">{us.code}</span>
              <span
                className={`ml-auto font-mono text-sm tabular-nums ${changeClass(us.change)}`}
              >
                {fmtChange(us.change)}
              </span>
            </div>
            <div className="mb-2 text-xs text-gray-400">↓ A股受益标的</div>
            <div className="flex flex-wrap gap-2">
              {peers.map((p) => (
                <Link
                  key={p.code}
                  href={`/stock/${p.code}`}
                  className="flex items-center gap-1.5 rounded-lg border border-gray-200 px-2 py-1 text-sm hover:border-gray-400"
                >
                  <span className="font-medium text-gray-800">{p.name}</span>
                  <span
                    className={`font-mono text-xs tabular-nums ${changeClass(p.change)}`}
                  >
                    {fmtChange(p.change)}
                  </span>
                </Link>
              ))}
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
    const avg = (list: Stock[]) =>
      list.length
        ? list.reduce((sum, r) => sum + r.change, 0) / list.length
        : null;
    return { sec, count: inSec.length, usAvg: avg(us), aAvg: avg(a) };
  }).filter((d) => d.count > 0);

  if (data.length === 0) return <Empty text="当前筛选下没有数据" />;

  return (
    <div className="overflow-hidden rounded-xl border border-gray-200 bg-white">
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
function ActiveDiscovery({ rows }: { rows: Stock[] }) {
  const GAP = 1.5; // 美股领先 A股 至少 1.5 个点才算预期差
  const map = new Map(rows.map((r) => [r.code, r]));

  const signals = rows
    .filter((s) => s.market === "美股" && s.change > 1)
    .map((us) => {
      const lagging = aSharePeers(us)
        .map((p) => map.get(p.code) ?? p)
        .filter((p) => us.change - p.change >= GAP);
      return { us, lagging };
    })
    .filter((x) => x.lagging.length > 0)
    .sort((a, b) => b.us.change - a.us.change);

  if (signals.length === 0)
    return (
      <Empty text="今日暂未发现明显预期差(美股涨、对应 A 股已同步反应或行情未连接)" />
    );

  return (
    <div className="space-y-3">
      <div className="rounded-lg bg-amber-50 px-4 py-2 text-xs text-amber-700">
        ⚡ 预期差:美股已上涨、对应 A 股标的涨幅明显落后的情况。注:历史规律不代表未来表现,仅供参考。
      </div>
      {signals.map(({ us, lagging }) => (
        <div
          key={us.code}
          className="rounded-xl border border-gray-200 bg-white p-4"
        >
          <div className="mb-2 flex items-center gap-2">
            <span className="text-base">⚡</span>
            <Link
              href={`/stock/${us.code}`}
              className="font-medium text-gray-900 hover:text-blue-600"
            >
              {us.name}
            </Link>
            <span className="text-sm text-gray-500">今日</span>
            <span className="font-mono text-sm font-medium text-rose-600">
              {fmtChange(us.change)}
            </span>
          </div>
          <div className="mb-1 text-xs text-gray-400">
            对应 A 股还没跟上的标的:
          </div>
          <div className="flex flex-wrap gap-2">
            {lagging.map((p) => (
              <Link
                key={p.code}
                href={`/stock/${p.code}`}
                className="flex items-center gap-1.5 rounded-lg border border-amber-200 bg-amber-50 px-2 py-1 text-sm hover:border-amber-400"
              >
                <span className="font-medium text-gray-800">{p.name}</span>
                <span
                  className={`font-mono text-xs tabular-nums ${changeClass(p.change)}`}
                >
                  {fmtChange(p.change)}
                </span>
              </Link>
            ))}
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
