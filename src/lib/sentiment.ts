// P2 AI链情绪仪表盘:只看我们 AI 链股票池的整体情绪。
// A 股家数/均涨跌:交易日开盘后全天实时行情(含午休/收盘后,产品口径=这组数保持实时),
// 开盘前/非交易日才用 Tushare EOD 日线;主力净流入合计:始终 EOD(无盘中源,允许停昨日)。
// 隔夜美股:新浪实时我们的美股池。
// 缓存三层:进程内 90s → DB(quotes_cache,跨实例)→ 冷算。冷算砍掉多余的全市场调用、
// 复用已落库的资金整包(mf)、整体加超时;超时/失败回退 DB 旧值,绝不再 504。
import { Prisma } from "@prisma/client";
import { STOCKS } from "@/data/stocks";
import { todayISO } from "@/lib/date";
import { dailyByDate, latestFundYmd, isAshareTradingDay } from "@/lib/tushare";
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
    netMfYi: number | null; // 主力净流入合计(亿元,EOD;取不到为 null)
    covered: number;
    pctLive: boolean; // 家数/均涨跌是否为盘中实时(否=收盘 EOD)
    pctAsOf: string; // 家数/均涨跌 时点:实时=北京"HH:MM";EOD=交易日"YYYY-MM-DD"
    netMfDate: string | null; // 主力净流入 的 EOD 交易日(始终收盘数据)
  } | null;
  us: {
    up: number;
    down: number;
    avgPct: number;
    covered: number;
    indices?: { name: string; change: number }[]; // 隔夜大盘 context:纳指/标普/费半
    asOf?: string; // 美股最新交易日(美东 YYYY-MM-DD)
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

// 北京当前 "HH:MM"
function beijingHM(): string {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Shanghai",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date());
}
// 是否处于 A 股交易钟点(9:30-11:30 / 13:00-15:00,周一~周五)。仅按钟点粗判,
// 节假日由 isAshareTradingDay 再排除;用于选缓存 TTL(交易中短缓存,其余长缓存)。
function inTradingClock(): boolean {
  const wd = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Shanghai",
    weekday: "short",
  }).format(new Date());
  if (wd === "Sat" || wd === "Sun") return false;
  const [h, m] = beijingHM().split(":").map(Number);
  const t = h * 60 + m;
  return (t >= 9 * 60 + 30 && t <= 11 * 60 + 30) || (t >= 13 * 60 && t <= 15 * 60);
}

// 家数/均涨跌的取数时段(产品口径:开盘后全天实时,主力资金才允许停在昨日 EOD):
// - pre:开盘前/周末 → 走 EOD(上一交易日收盘,这时"最新"本来就是昨收)
// - live:9:30~15:00(含午休,行情源返回今日最新一帧;午休即上午收盘价)→ 盘中实时
// - post:15:00 后 → 行情源已是今日收盘价,按"今日收盘"口径展示(不用等 Tushare 傍晚出数)
// 曾经 live 只覆盖交易钟点:午休/盘后重算会把"今日情绪"回退成昨收,涨跌方向都能反过来
// (2026-07-03 用户在午休看到卡片仍挂着昨日 -5.07%,当时链内实际普涨)。
function ashareClockPhase(): "pre" | "live" | "post" {
  const wd = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Shanghai",
    weekday: "short",
  }).format(new Date());
  if (wd === "Sat" || wd === "Sun") return "pre";
  const [h, m] = beijingHM().split(":").map(Number);
  const t = h * 60 + m;
  if (t < 9 * 60 + 30) return "pre";
  if (t <= 15 * 60) return "live";
  return "post";
}

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

// 池内 A 股当日涨跌幅(pct)按交易日落 DB 缓存:全市场日线大表只在当天首个冷算拉一次,
// 之后跨实例秒回。这是原冷算 ~19s 的主要瓶颈(dailyByDate 全市场、仅进程内缓存、不跨实例)。
async function getAsharePct(ymd: string, aCodes: string[]): Promise<Map<string, number>> {
  const db = getPrisma();
  const id = `apct:${ymd}`;
  if (db) {
    const row = await db.quotesCache.findUnique({ where: { id } }).catch(() => null);
    if (row?.data) return new Map(Object.entries(row.data as Record<string, number>));
  }
  const full = await dailyByDate(ymd); // 全市场(慢),只取池内
  const sub: Record<string, number> = {};
  for (const c of aCodes) {
    const v = full.get(c);
    if (v !== undefined) sub[c] = v;
  }
  if (db && Object.keys(sub).length) {
    const data = sub as unknown as Prisma.InputJsonValue;
    await db.quotesCache
      .upsert({ where: { id }, create: { id, data }, update: { data } })
      .catch(() => {});
  }
  return new Map(Object.entries(sub));
}

async function computeSentiment(): Promise<ChainSentiment> {
  const aCodes = STOCKS.filter((s) => s.market === "A股").map((s) => s.code);
  const usCodes = STOCKS.filter((s) => s.market === "美股").map((s) => s.code);

  // A 股(EOD):mf 走 DB 整包(已缓存),pct 走全市场日线(进程内缓存)
  const aTask = (async (): Promise<{ a: ChainSentiment["a"]; date: string | null }> => {
    const ymd = await latestYmd(); // EOD 交易日(主力净流入始终用它)
    const eodDate = ymd
      ? `${ymd.slice(0, 4)}-${ymd.slice(4, 6)}-${ymd.slice(6, 8)}`
      : null;

    // 家数/均涨跌:交易日开盘后(含午休/收盘后)一律走实时行情——产品口径是这组数保持实时,
    // 只有主力资金允许停在 EOD。开盘前/非交易日才走 EOD 全市场日线。
    const phase = ashareClockPhase();
    const useQuotes =
      phase !== "pre" && (await isAshareTradingDay(todayISO()).catch(() => false));

    let pcts: number[] = [];
    let pctLive = false;
    let pctAsOf = eodDate ?? "";
    if (useQuotes) {
      const res = await withTimeout(fetchQuotes(aCodes), 6000).catch(() => null);
      const q = res?.quotes ?? {};
      pcts = aCodes
        .map((c) => q[c]?.change)
        .filter((v): v is number => v !== undefined && v !== null);
      if (pcts.length) {
        if (phase === "post") {
          // 收盘后:行情源给的就是今日收盘价,按"今日收盘"口径(pctAsOf=今天,非实时红点)
          pctLive = false;
          pctAsOf = todayISO();
        } else {
          pctLive = true;
          pctAsOf = beijingHM(); // 盘中/午休数据时点 "HH:MM"(午休=上午收盘的最新一帧)
        }
      }
    }
    if (!pcts.length) {
      // 开盘前/非交易日/实时取空 → 回退 EOD 全市场日线(原逻辑)
      if (!ymd) return { a: null, date: null };
      const pctMap = await getAsharePct(ymd, aCodes);
      pcts = aCodes
        .map((c) => pctMap.get(c))
        .filter((v): v is number => v !== undefined);
      pctLive = false;
      pctAsOf = eodDate ?? "";
    }
    if (!pcts.length) return { a: null, date: null };

    // 主力净流入:始终 EOD 整包(Tushare moneyflow 仅收盘后日频,无盘中源)。
    const bundle = ymd ? await getFundBundle(ymd).catch(() => null) : null;
    const mfVals = bundle
      ? aCodes.map((c) => bundle.mf[c]).filter((v): v is number => v !== undefined)
      : [];
    const netMfYi = mfVals.length
      ? Math.round(mfVals.reduce((s, v) => s + v, 0) * 100) / 100
      : null;

    const up = pcts.filter((v) => v > 0).length;
    const down = pcts.filter((v) => v < 0).length;
    const avg = pcts.reduce((s, v) => s + v, 0) / pcts.length;
    return {
      a: {
        up,
        down,
        flat: pcts.length - up - down,
        avgPct: Math.round(avg * 100) / 100,
        netMfYi,
        covered: pcts.length,
        pctLive,
        pctAsOf,
        netMfDate: eodDate,
      },
      date: eodDate,
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
    const asOf = [
      ...Object.values(quotes).map((q) => q.asOf),
      ...indices.map((i) => i.asOf),
    ]
      .filter((v): v is string => Boolean(v))
      .sort()
      .at(-1);
    return {
      up,
      down,
      avgPct: Math.round(avg * 100) / 100,
      covered: ch.length,
      indices: idx,
      asOf,
    };
  })();

  const [aRes, us] = await Promise.all([aTask, usTask]);
  return { date: aRes.date, a: aRes.a, us };
}

// 情绪卡“今日”的日期跟 A 股涨跌口径走,不能跟滞后一日的主力资金日期走。
export function sentimentDisplayDate(data: ChainSentiment | null | undefined): string {
  if (data?.a?.pctLive) return todayISO();
  if (data?.a?.pctAsOf && /^\d{4}-\d{2}-\d{2}$/.test(data.a.pctAsOf))
    return data.a.pctAsOf;
  return data?.date ?? todayISO();
}

// 只读快照(ISR 页面专用):纯 L1/DB 读,**绝不触发冷算/任何 fetch**。
// Next 14 里渲染期间碰到 no-store fetch 会把整页打成动态渲染(ISR 报废、每请求都跑函数),
// 首页/落地页务必用这个;fresh=false 时由客户端组件后台拉 /api/chain-sentiment 刷新+回写缓存。
export async function sentimentSnapshot(): Promise<{
  data: ChainSentiment;
  fresh: boolean;
} | null> {
  const trading = inTradingClock();
  const ttl = trading ? 45_000 : TTL;
  const dbFresh = trading ? 90_000 : DB_FRESH;
  if (cache && Date.now() - cache.at < ttl) return { data: cache.data, fresh: true };
  const db = getPrisma();
  if (!db) return null;
  const row = await db.quotesCache
    .findUnique({ where: { id: CACHE_ID } })
    .catch(() => null);
  if (!row?.data) return null;
  const data = row.data as unknown as ChainSentiment;
  const fresh = Date.now() - new Date(row.updatedAt).getTime() < dbFresh;
  return { data, fresh };
}

export async function chainSentiment(): Promise<ChainSentiment> {
  // 盘中家数/均涨跌是实时的,缓存要短(否则挂 20min 就不"实时"了);盘后回到长缓存。
  const trading = inTradingClock();
  const ttl = trading ? 45_000 : TTL;
  const dbFresh = trading ? 90_000 : DB_FRESH;
  if (cache && Date.now() - cache.at < ttl) return cache.data;
  const db = getPrisma();

  // L2:DB 缓存(跨实例)。够新直接返回;否则留作回退
  let stale: ChainSentiment | null = null;
  if (db) {
    const row = await db.quotesCache
      .findUnique({ where: { id: CACHE_ID } })
      .catch(() => null);
    if (row?.data) {
      stale = row.data as unknown as ChainSentiment;
      if (Date.now() - new Date(row.updatedAt).getTime() < dbFresh) {
        cache = { at: Date.now(), data: stale };
        return stale;
      }
    }
  }

  // 冷算(带总预算超时);失败/超时回退 DB 旧值,绝不 504
  try {
    const data = await withTimeout(computeSentiment(), COMPUTE_BUDGET);
    // 一次 US 抖动(新浪封/Yahoo 超时)别抹掉大盘:这次没取到 US 但缓存里有,沿用缓存的 US。
    if (!data.us && stale?.us) data.us = stale.us;
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
