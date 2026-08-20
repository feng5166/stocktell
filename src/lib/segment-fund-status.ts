// AI 链内资金状态:把同一交易日的核定链内成分股主力净额与成交额聚合到产业环节。
// 只描述可观察的资金方向,不推断“建仓/洗盘/出货”,也不把资金行为当产业证据。
import { Prisma } from "@prisma/client";
import { getChain, FALLBACK_SEGMENT } from "@/data/chains";
import { todayISO } from "@/lib/date";
import { getFundBundle } from "@/lib/fund-flow";
import { getPrisma } from "@/lib/prisma";
import {
  dailyMarketByDate,
  latestFundYmd,
  type DailyMarketPoint,
} from "@/lib/tushare";

export type FundState =
  | "明显流入"
  | "温和流入"
  | "多空分化"
  | "温和流出"
  | "明显流出";

export type PriceFlowRelation = "同向" | "分叉" | "暂不一致";

export interface SegmentFundRow {
  segment: string;
  plain: string;
  memberCount: number;
  covered: number;
  avgPct: number;
  amountYi: number;
  netMfYi: number;
  strengthPct: number;
  state: FundState;
  relation: PriceFlowRelation;
  verify: string[];
}

export interface SegmentFundStatus {
  date: string | null;
  chainId: string;
  chainName: string;
  formula: string;
  scope: string;
  summary: string;
  rows: SegmentFundRow[];
}

const CACHE_ID = "segment-fund-status-v2";
const MIN_COVERED = 2;
const MAX_ROWS = 5;
const FORMULA = "链内净额/成交比 = 核定成分股主力净额合计 ÷ 同日成交额合计 × 100%";
const SCOPE = "仅看 StockTell 已核定的 AI 产业链样本,用于观察链内资金方向;不代表全市场板块排名";
let memory: { at: number; data: SegmentFundStatus } | null = null;

const round = (v: number, digits = 2) => {
  const p = 10 ** digits;
  return Math.round(v * p) / p;
};

export function classifyFundState(strengthPct: number): FundState {
  if (strengthPct >= 3) return "明显流入";
  if (strengthPct >= 1) return "温和流入";
  if (strengthPct <= -3) return "明显流出";
  if (strengthPct <= -1) return "温和流出";
  return "多空分化";
}

export function classifyPriceFlowRelation(
  avgPct: number,
  strengthPct: number
): PriceFlowRelation {
  const priceDirection = avgPct >= 0.2 ? 1 : avgPct <= -0.2 ? -1 : 0;
  const flowDirection = strengthPct >= 0.5 ? 1 : strengthPct <= -0.5 ? -1 : 0;
  if (priceDirection && flowDirection) {
    return priceDirection === flowDirection ? "同向" : "分叉";
  }
  return "暂不一致";
}

function iso(ymd: string) {
  return `${ymd.slice(0, 4)}-${ymd.slice(4, 6)}-${ymd.slice(6, 8)}`;
}

async function latestYmd(): Promise<string | null> {
  const db = getPrisma();
  if (db) {
    const row = await db.fundDayCache
      .findFirst({ orderBy: { ymd: "desc" }, select: { ymd: true } })
      .catch(() => null);
    if (row?.ymd) return row.ymd;
  }
  return latestFundYmd(todayISO());
}

function buildSummary(rows: SegmentFundRow[]): string {
  if (!rows.length) return "资金状态数据生成中。";
  const inflow = [...rows].sort((a, b) => b.strengthPct - a.strengthPct)[0];
  const outflow = [...rows].sort((a, b) => a.strengthPct - b.strengthPct)[0];
  const divergent = rows.find((r) => r.relation === "分叉");
  if (inflow.strengthPct >= 1 && outflow.strengthPct <= -1) {
    return `资金在${inflow.segment}与${outflow.segment}之间明显分化${
      divergent ? `;${divergent.segment}出现价格与资金分叉` : ""
    }。`;
  }
  if (outflow.strengthPct <= -1) {
    return `链内资金整体偏谨慎,${outflow.segment}流出最明显${
      divergent ? `;${divergent.segment}出现价格与资金分叉` : ""
    }。`;
  }
  if (inflow.strengthPct >= 1) {
    return `链内资金偏向${inflow.segment}${
      divergent ? `,但${divergent.segment}的价格与资金出现分叉` : ""
    }。`;
  }
  return divergent
    ? `链内资金暂未形成一致方向,${divergent.segment}的价格与资金出现分叉。`
    : "链内资金暂未形成一致方向,当前以分化观察为主。";
}

function aggregate(
  market: Map<string, DailyMarketPoint>,
  mf: Record<string, number>
): SegmentFundRow[] {
  const chain = getChain("ai");
  if (!chain?.segments) return [];
  const rows: SegmentFundRow[] = [];
  for (const segment of chain.segments) {
    if (segment.name === FALLBACK_SEGMENT || segment.sectors.length === 0) continue;
    const members = chain.aMembers.filter((s) => segment.sectors.includes(s.sector));
    const points = members
      .map((stock) => {
        const daily = market.get(stock.code);
        const netMf = mf[stock.code];
        return daily && netMf !== undefined ? { daily, netMf } : null;
      })
      .filter((x): x is { daily: DailyMarketPoint; netMf: number } => x !== null);
    if (points.length < MIN_COVERED) continue;
    const amountYi = points.reduce((sum, p) => sum + p.daily.amountYi, 0);
    if (amountYi <= 0) continue;
    const netMfYi = points.reduce((sum, p) => sum + p.netMf, 0);
    const weightedPct =
      points.reduce((sum, p) => sum + p.daily.pct * p.daily.amountYi, 0) / amountYi;
    const strengthPct = (netMfYi / amountYi) * 100;
    rows.push({
      segment: segment.name,
      plain: segment.plain,
      memberCount: members.length,
      covered: points.length,
      avgPct: round(weightedPct),
      amountYi: round(amountYi, 1),
      netMfYi: round(netMfYi),
      strengthPct: round(strengthPct),
      state: classifyFundState(strengthPct),
      relation: classifyPriceFlowRelation(weightedPct, strengthPct),
      verify: segment.verifyTemplate.slice(0, 2),
    });
  }
  return rows.sort((a, b) => Math.abs(b.strengthPct) - Math.abs(a.strengthPct));
}

async function compute(ymd: string): Promise<SegmentFundStatus> {
  const [bundle, market] = await Promise.all([
    getFundBundle(ymd),
    dailyMarketByDate(ymd),
  ]);
  // 本功能只依赖 moneyflow + daily;龙虎榜/融资源即使暂时失败,也不应阻断已完整拿到的
  // 主力净额与成交额。mf 为空才视为本功能所需资金源不完整。
  if (Object.keys(bundle.mf).length === 0 || market.size === 0) {
    throw new Error("segment fund source incomplete");
  }
  const allRows = aggregate(market, bundle.mf);
  if (!allRows.length) throw new Error("segment fund rows empty");
  return {
    date: iso(ymd),
    chainId: "ai",
    chainName: "AI 产业链",
    formula: FORMULA,
    scope: SCOPE,
    summary: buildSummary(allRows),
    rows: allRows.slice(0, MAX_ROWS),
  };
}

async function readCached(): Promise<SegmentFundStatus | null> {
  if (memory && Date.now() - memory.at < 10 * 60 * 1000) return memory.data;
  const db = getPrisma();
  if (!db) return null;
  const row = await db.quotesCache
    .findUnique({ where: { id: CACHE_ID }, select: { data: true } })
    .catch(() => null);
  if (!row?.data) return null;
  // 展示口径随代码统一收敛,不让当天旧缓存继续回放旧名称。
  const data = {
    ...(row.data as unknown as SegmentFundStatus),
    formula: FORMULA,
    scope: SCOPE,
  };
  memory = { at: Date.now(), data };
  return data;
}

// 首页 ISR 只读快照,绝不在服务端渲染期间触发 Tushare。
export async function segmentFundStatusSnapshot(): Promise<SegmentFundStatus | null> {
  return readCached();
}

export async function segmentFundStatus(): Promise<SegmentFundStatus> {
  const [ymd, stale] = await Promise.all([latestYmd(), readCached()]);
  if (!ymd) {
    return stale ?? {
      date: null,
      chainId: "ai",
      chainName: "AI 产业链",
      formula: FORMULA,
      scope: SCOPE,
      summary: "资金状态数据生成中。",
      rows: [],
    };
  }
  if (stale?.date === iso(ymd) && stale.rows.length) return stale;
  try {
    const data = await compute(ymd);
    const db = getPrisma();
    if (db) {
      const payload = data as unknown as Prisma.InputJsonValue;
      await db.quotesCache
        .upsert({
          where: { id: CACHE_ID },
          create: { id: CACHE_ID, data: payload },
          update: { data: payload },
        })
        .catch(() => {});
    }
    memory = { at: Date.now(), data };
    return data;
  } catch {
    if (stale) return stale;
    return {
      date: iso(ymd),
      chainId: "ai",
      chainName: "AI 产业链",
      formula: FORMULA,
      scope: SCOPE,
      summary: "资金状态数据生成中。",
      rows: [],
    };
  }
}
