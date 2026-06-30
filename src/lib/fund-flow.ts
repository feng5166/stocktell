// 你的票·资金面:聚合某用户自选(A 股)的主力净流入 + 龙虎榜 + 融资余额变化。
// 共享给 /api/fund-flow(网页卡片)和 morning-brief(早报/邮件/微信),口径一致、各自缓存复用。
import { unstable_cache } from "next/cache";
import { Prisma } from "@prisma/client";
import { STOCK_MAP } from "@/data/stocks";
import { getPrisma } from "@/lib/prisma";
import { todayISO } from "@/lib/date";
import {
  moneyflowByDate,
  longhuByDate,
  marginByDate,
  latestFundYmd,
  prevAshareTradingDay,
  type LonghuHit,
} from "@/lib/tushare";

// 某交易日全市场资金面整包(主力净流入/龙虎榜/融资余额),按日落 DB 缓存。
// 每天首个请求拉一次 Tushare 大表 → 写库;之后任何实例直接读库(秒回),
// 解决原 unstable_cache 不跨 serverless 实例持久、每次冷启动重打 31s 的问题。
export interface FundBundle {
  mf: Record<string, number>; // 裸code -> 主力净流入(亿)
  lh: Record<string, LonghuHit>; // 裸code -> 龙虎榜
  mg: Record<string, number>; // 裸code -> 融资余额(亿)
}
export async function getFundBundle(ymd: string): Promise<FundBundle> {
  const db = getPrisma();
  if (db) {
    const row = await db.fundDayCache.findUnique({ where: { ymd } }).catch(() => null);
    if (row?.data) return row.data as unknown as FundBundle;
  }
  const [mf, lh, mg] = await Promise.all([
    moneyflowByDate(ymd),
    longhuByDate(ymd),
    marginByDate(ymd),
  ]);
  const bundle: FundBundle = {
    mf: Object.fromEntries(mf),
    lh: Object.fromEntries(lh),
    mg: Object.fromEntries(mg),
  };
  // 只在确有数据时落库(避免把"当天数据还没出"的空包缓存住)
  if (db && (mf.size > 0 || mg.size > 0)) {
    const data = bundle as unknown as Prisma.InputJsonValue;
    await db.fundDayCache
      .upsert({ where: { ymd }, create: { ymd, data }, update: { data } })
      .catch(() => {});
  }
  return bundle;
}

export interface FundFlowItem {
  code: string;
  name: string;
  netMf: number | null; // 主力净流入(亿元)
  longhu: LonghuHit | null; // 龙虎榜净额/原因
  rzChgYi: number | null; // 融资余额较上一交易日变化(亿元)
}

export interface FundFlowResult {
  date: string | null; // 数据交易日 YYYY-MM-DD
  items: FundFlowItem[];
}

const ymdToISO = (ymd: string) =>
  `${ymd.slice(0, 4)}-${ymd.slice(4, 6)}-${ymd.slice(6, 8)}`;

async function computeFundFlow(codes: string[]): Promise<FundFlowResult> {
  const aCodes = codes.filter((c) => STOCK_MAP[c]?.market === "A股");
  if (aCodes.length === 0) return { date: null, items: [] };

  const ymd = await latestFundYmd(todayISO());
  if (!ymd) return { date: null, items: [] };

  const prevIso = await prevAshareTradingDay(ymdToISO(ymd));
  const prevYmd = prevIso ? prevIso.replace(/-/g, "") : null;

  // 按日 DB 缓存:当天 + 上一交易日(算融资余额变化)各取一次整包
  const [bundle, prevBundle] = await Promise.all([
    getFundBundle(ymd),
    prevYmd ? getFundBundle(prevYmd) : Promise.resolve(null as FundBundle | null),
  ]);

  const items: FundFlowItem[] = aCodes.map((code) => {
    const rz = bundle.mg[code];
    const rzPrev = prevBundle?.mg[code];
    const rzChgYi =
      rz !== undefined && rzPrev !== undefined
        ? Math.round((rz - rzPrev) * 100) / 100
        : null;
    return {
      code,
      name: STOCK_MAP[code].name,
      netMf: bundle.mf[code] ?? null,
      longhu: bundle.lh[code] ?? null,
      rzChgYi,
    };
  });

  return { date: ymdToISO(ymd), items };
}

// 按(去重排序后的)代码组合缓存 30 分钟。资金面是 T+1 日频数据,半小时足够新。
// 关键收益:morning-brief 内部与 /api/fund-flow 两个独立 serverless 调用共享同一份结果
// (Next Data Cache 跨实例持久),不再各打一遍 Tushare(moneyflow/top_list/margin)。
export async function fundFlowFor(codes: string[]): Promise<FundFlowResult> {
  const sorted = Array.from(
    new Set(codes.filter((c) => STOCK_MAP[c]?.market === "A股"))
  ).sort();
  if (sorted.length === 0) return { date: null, items: [] };
  return unstable_cache(() => computeFundFlow(sorted), ["fund-flow", sorted.join(",")], {
    revalidate: 1800,
  })();
}
