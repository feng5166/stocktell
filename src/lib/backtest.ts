// 冷启动回测:用东财历史日K,把过去 N 个 A 股交易日的"隔夜美股异动 → A 股受益标的当日兑现"
// 信号忠实重放一遍,按与实盘完全相同的口径(异动≥2%、同向≥1% 记命中)打分,写库标 isBacktest=true。
// 明牌:这是历史回测、不是实盘喊单,/track 上与实盘物理分区展示。
//
// 数据源现实:东财对 Vercel 机房 IP 限频(实拉 8/23),但对住宅 IP 正常;而 DB 连接串只在 Vercel 注入。
// 因此拆两段:computeBacktestRows(只拉取+计算,本地住宅 IP 跑,dry-run 返回 rows)
// → ingestRows(只写库,在 Vercel 上跑)。见 /api/admin/backtest?dry=1 与 /api/admin/backtest-ingest。
import { STOCKS, aSharePeers } from "@/data/stocks";
import { getPrisma } from "@/lib/prisma";
import { emSecid, fetchDailyBars, type DailyBar } from "@/lib/history";

const MOVER_THRESHOLD = 2; // 同 generate.ts:美股 |涨跌| ≥2% 视为异动
const HIT_THRESHOLD = 1.0; // 同 outcomes.ts:同向涨跌 ≥1% 记"跟上"

export interface BacktestRow {
  briefingId: string;
  date: string;
  title: string;
  impact: string;
  code: string;
  name: string;
  expected: string;
  change: number | null;
  hit: boolean | null;
}

export interface BacktestCompute {
  ok: boolean;
  skipped?: string;
  triggers: number; // 有 A 股映射的美股触发标的数
  usCovered: number; // 实际拉到历史的美股数
  aCovered: number; // 实际拉到历史的 A 股数
  evaluatedDates: number; // 评估的 A 股交易日数
  rows: BacktestRow[];
}

// 顺序拉取 + 间隔,降低被限频概率;失败的标的留空,后面按未覆盖跳过。
async function loadBars(
  items: { code: string; market: "美股" | "A股" }[],
  gapMs = 250
): Promise<Map<string, DailyBar[]>> {
  const out = new Map<string, DailyBar[]>();
  for (const it of items) {
    out.set(it.code, await fetchDailyBars(emSecid(it.code, it.market)));
    await new Promise((res) => setTimeout(res, gapMs));
  }
  return out;
}

// 只拉取 + 计算,不碰 DB。可在住宅 IP 本地跑(dry-run)。
export async function computeBacktestRows(days = 20): Promise<BacktestCompute> {
  const triggers = STOCKS.filter(
    (s) => s.market === "美股" && aSharePeers(s).length > 0
  );
  const peers = new Map<string, { code: string; name: string }>();
  triggers.forEach((t) =>
    aSharePeers(t).forEach((p) => peers.set(p.code, { code: p.code, name: p.name }))
  );

  const usBars = await loadBars(
    triggers.map((t) => ({ code: t.code, market: "美股" as const }))
  );
  const aBars = await loadBars(
    Array.from(peers.values()).map((p) => ({ code: p.code, market: "A股" as const }))
  );

  const usCovered = Array.from(usBars.values()).filter((b) => b.length > 0).length;
  const aCovered = Array.from(aBars.values()).filter((b) => b.length > 0).length;

  // A 股交易日序列:用覆盖最全的一只取日期轴,去掉最新一根(可能当天未收盘),取最近 days 天
  let aDates: string[] = [];
  for (const bars of Array.from(aBars.values()))
    if (bars.length > aDates.length) aDates = bars.map((b) => b.date);
  aDates = aDates.slice(0, -1).slice(-days);
  if (aDates.length === 0)
    return { ok: true, skipped: "no-history", triggers: triggers.length, usCovered, aCovered, evaluatedDates: 0, rows: [] };

  const usChangeOn = (code: string, date: string) =>
    usBars.get(code)?.find((b) => b.date === date)?.change;
  // Beijing 日 d 的"隔夜美股" = 严格早于 d 的最近一个美股交易日(排除同日,实时当时还没收盘)
  const usDateBefore = (code: string, date: string): string | undefined => {
    let best: string | undefined;
    for (const b of usBars.get(code) ?? [])
      if (b.date < date && (!best || b.date > best)) best = b.date;
    return best;
  };
  const aChangeOn = (code: string, date: string): number | null => {
    const v = aBars.get(code)?.find((b) => b.date === date)?.change;
    return v === undefined ? null : v;
  };

  const rows: BacktestRow[] = [];
  for (const d of aDates) {
    for (const t of triggers) {
      const usDate = usDateBefore(t.code, d);
      if (!usDate) continue;
      const usChg = usChangeOn(t.code, usDate);
      if (usChg === undefined || Math.abs(usChg) < MOVER_THRESHOLD) continue;

      const expected: "涨" | "跌" = usChg < 0 ? "跌" : "涨";
      const impact = Math.abs(usChg) >= 4 ? "高" : "中";
      const title = `${t.name}隔夜${expected === "涨" ? "上涨" : "下跌"} ${Math.abs(usChg).toFixed(2)}%`;
      const briefingId = `bt-${d}-${t.code}`;

      for (const p of aSharePeers(t)) {
        const chg = aChangeOn(p.code, d);
        const hit =
          chg === null ? null : expected === "涨" ? chg >= HIT_THRESHOLD : chg <= -HIT_THRESHOLD;
        rows.push({
          briefingId,
          date: d,
          title,
          impact,
          code: p.code,
          name: p.name,
          expected,
          change: chg,
          hit,
        });
      }
    }
  }

  return { ok: true, triggers: triggers.length, usCovered, aCovered, evaluatedDates: aDates.length, rows };
}

// 只写库(在 Vercel 上跑,DB 可达)。幂等:(briefingId, code) 唯一,upsert。
export async function ingestRows(rows: BacktestRow[]): Promise<number> {
  const db = getPrisma();
  if (!db) return 0;
  let n = 0;
  for (const r of rows) {
    await db.briefingOutcome.upsert({
      where: { briefingId_code: { briefingId: r.briefingId, code: r.code } },
      create: {
        briefingId: r.briefingId,
        date: r.date,
        title: r.title,
        impact: r.impact,
        code: r.code,
        name: r.name,
        expected: r.expected,
        change: r.change,
        hit: r.hit,
        isBacktest: true,
      },
      update: { change: r.change, hit: r.hit, isBacktest: true, evaluatedAt: new Date() },
    });
    n++;
  }
  return n;
}

export interface BacktestResult extends Omit<BacktestCompute, "rows"> {
  written: number;
}

// 一站式(仅当运行环境同时能拉历史 + 连库时可用;Vercel 上会被东财限频)。
export async function runBacktest(days = 20): Promise<BacktestResult> {
  const db = getPrisma();
  if (!db)
    return { ok: true, skipped: "no-db", triggers: 0, usCovered: 0, aCovered: 0, evaluatedDates: 0, written: 0 };
  const c = await computeBacktestRows(days);
  const written = await ingestRows(c.rows);
  const { rows: _omit, ...meta } = c;
  void _omit;
  return { ...meta, written };
}
