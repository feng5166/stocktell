// P2 AI链情绪仪表盘:只看我们 AI 链股票池的整体情绪。
// A 股:Tushare 整日涨跌 + 主力净流入合计(EOD);隔夜美股:新浪实时我们的美股池。
// 缓存三层:进程内 90s → DB(quotes_cache,跨实例)→ 冷算。冷算砍掉多余的全市场调用、
// 复用已落库的资金整包(mf)、整体加超时;超时/失败回退 DB 旧值,绝不再 504。
import { Prisma } from "@prisma/client";
import { STOCKS } from "@/data/stocks";
import { todayISO } from "@/lib/date";
import { dailyByDate, latestFundYmd } from "@/lib/tushare";
import { getFundBundle } from "@/lib/fund-flow";
import { getPrisma } from "@/lib/prisma";
import { fetchQuotes, fetchUsIndices } from "@/lib/quotes";

export interface ChainSentiment {
  date: string | null; // A 股数据交易日
  a: {
    up: number;
    down: number;
    flat: number;
    avgPct: number;
    netMfYi: number; // 主力净流入合计(亿元)
    covered: number;
  } | null;
  us: {
    up: number;
    down: number;
    avgPct: number;
    covered: number;
    indices?: { name: string; change: number }[]; // 隔夜大盘 context:纳指/标普/费半
  } | null;
}

let cache: { at: number; data: ChainSentiment } | null = null;
const TTL = 90_000; // 进程内 90s
const DB_FRESH = 20 * 60 * 1000; // DB 缓存 20 分钟内视为新鲜
const CACHE_ID = "chain-sentiment-v1"; // 复用 quotes_cache 表(免迁移)
const COMPUTE_BUDGET = 18_000; // 冷算总预算,超时回退旧值

const withTimeout = <T>(p: Promise<T>, ms: number): Promise<T> =>
  Promise.race([
    p,
    new Promise<T>((_, rej) => setTimeout(() => rej(new Error("timeout")), ms)),
  ]);

// 最近一个有数据的交易日 ymd:优先读 fund_day_cache(DB,资金面/早报已落库),
// 拿不到再退回 latestFundYmd(会打 Tushare)。避免每次冷算都探 moneyflow(today)。
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

async function computeSentiment(): Promise<ChainSentiment> {
  const aCodes = STOCKS.filter((s) => s.market === "A股").map((s) => s.code);
  const usCodes = STOCKS.filter((s) => s.market === "美股").map((s) => s.code);

  // A 股(EOD):mf 走 DB 整包(已缓存),pct 走全市场日线(进程内缓存)
  const aTask = (async (): Promise<{ a: ChainSentiment["a"]; date: string | null }> => {
    const ymd = await latestYmd();
    if (!ymd) return { a: null, date: null };
    const [pctMap, bundle] = await Promise.all([dailyByDate(ymd), getFundBundle(ymd)]);
    const pcts = aCodes
      .map((c) => pctMap.get(c))
      .filter((v): v is number => v !== undefined);
    if (!pcts.length) return { a: null, date: null };
    const up = pcts.filter((v) => v > 0).length;
    const down = pcts.filter((v) => v < 0).length;
    const avg = pcts.reduce((s, v) => s + v, 0) / pcts.length;
    const netMf = aCodes
      .map((c) => bundle.mf[c])
      .filter((v): v is number => v !== undefined)
      .reduce((s, v) => s + v, 0);
    return {
      a: {
        up,
        down,
        flat: pcts.length - up - down,
        avgPct: Math.round(avg * 100) / 100,
        netMfYi: Math.round(netMf * 100) / 100,
        covered: pcts.length,
      },
      date: `${ymd.slice(0, 4)}-${ymd.slice(4, 6)}-${ymd.slice(6, 8)}`,
    };
  })().catch(() => ({ a: null, date: null } as { a: ChainSentiment["a"]; date: string | null }));

  // 隔夜美股(新浪实时):自选美股池涨跌 + 大盘指数 context(纳指/标普/费半)并行,各自加超时。
  // 即便自选池取数失败,只要指数拿到也展示(给"普涨还是产业超额"的参照)。
  const usTask = (async (): Promise<ChainSentiment["us"]> => {
    const [poolRes, indices] = await Promise.all([
      withTimeout(fetchQuotes(usCodes), 6000).catch(() => null),
      withTimeout(fetchUsIndices(), 6000).catch(
        () => [] as Awaited<ReturnType<typeof fetchUsIndices>>
      ),
    ]);
    const quotes = poolRes?.quotes ?? {};
    const ch = usCodes
      .map((c) => quotes[c]?.change)
      .filter((v): v is number => v !== undefined && v !== null);
    const idx = indices.map((i) => ({ name: i.name, change: i.change }));
    if (!ch.length && idx.length === 0) return null;
    const up = ch.filter((v) => v > 0).length;
    const down = ch.filter((v) => v < 0).length;
    const avg = ch.length ? ch.reduce((s, v) => s + v, 0) / ch.length : 0;
    return {
      up,
      down,
      avgPct: Math.round(avg * 100) / 100,
      covered: ch.length,
      indices: idx,
    };
  })();

  const [aRes, us] = await Promise.all([aTask, usTask]);
  return { date: aRes.date, a: aRes.a, us };
}

export async function chainSentiment(): Promise<ChainSentiment> {
  if (cache && Date.now() - cache.at < TTL) return cache.data;
  const db = getPrisma();

  // L2:DB 缓存(跨实例)。够新直接返回;否则留作回退
  let stale: ChainSentiment | null = null;
  if (db) {
    const row = await db.quotesCache
      .findUnique({ where: { id: CACHE_ID } })
      .catch(() => null);
    if (row?.data) {
      stale = row.data as unknown as ChainSentiment;
      if (Date.now() - new Date(row.updatedAt).getTime() < DB_FRESH) {
        cache = { at: Date.now(), data: stale };
        return stale;
      }
    }
  }

  // 冷算(带总预算超时);失败/超时回退 DB 旧值,绝不 504
  try {
    const data = await withTimeout(computeSentiment(), COMPUTE_BUDGET);
    if (db && (data.a || data.us)) {
      const payload = data as unknown as Prisma.InputJsonValue;
      await db.quotesCache
        .upsert({
          where: { id: CACHE_ID },
          create: { id: CACHE_ID, data: payload },
          update: { data: payload },
        })
        .catch(() => {});
    }
    cache = { at: Date.now(), data };
    return data;
  } catch {
    if (stale) {
      cache = { at: Date.now(), data: stale };
      return stale;
    }
    return { date: null, a: null, us: null };
  }
}
