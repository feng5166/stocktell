import Link from "next/link";
import { SiteHeader } from "@/components/SiteHeader";
import {
  listOutcomes,
  summarize,
  summarizeByImpact,
  HIT_THRESHOLD,
  MIN_SAMPLE,
  type OutcomeRow,
  type HitStats,
} from "@/lib/outcomes";
import { storageBackend, type Impact } from "@/lib/briefings";
import { changeClass, fmtChange } from "@/lib/format";
import { IMPACT_META } from "@/lib/impact";
import { Th, Td } from "@/components/Table";

export const dynamic = "force-dynamic";

export default async function TrackPage() {
  const live = await listOutcomes(300, false).catch(() => []);
  const backtest = await listOutcomes(300, true).catch(() => []);
  const liveStats = summarize(live);
  const btStats = summarize(backtest);
  const liveByImpact = summarizeByImpact(live);
  const btByImpact = summarizeByImpact(backtest);

  return (
    <div className="min-h-screen bg-[#f7f8fa] text-[#1a1d24]">
      <SiteHeader active="战绩" />

      <main className="mx-auto max-w-3xl px-4 py-6 sm:px-6">
        <div className="mb-4">
          <h1 className="text-xl font-semibold tracking-tight">查账 · 我准不准</h1>
          <p className="mt-1 text-xs text-gray-400">
            每条简报喊的受益 A 股,当日收盘后回填实际表现。喊了就记,记了就敢给你查。
          </p>
        </div>

        {/* 规则透明 */}
        <div className="mb-5 rounded-lg bg-gray-100 px-4 py-3 text-xs leading-relaxed text-gray-500">
          判定规则(透明):触发美股涨 → 期待对应 A 股涨,跌 → 期待跌;当日同向且涨跌幅
          ≥ {HIT_THRESHOLD}% 记一次「跟上」。早期样本少,命中率会波动,仅供参考,不构成投资建议。
        </div>

        {/* 实盘喊单 */}
        <section className="mb-8">
          <h2 className="mb-2 text-sm font-semibold text-gray-700">
            实盘喊单 · 自动记账起
          </h2>
          <Overview stats={liveStats} byImpact={liveByImpact} />
          {live.length === 0 ? (
            <div className="rounded-xl border border-dashed border-gray-300 bg-white py-12 text-center">
              <div className="text-sm font-medium text-gray-500">还在积累中</div>
              <div className="mt-1 text-xs text-gray-400">
                从今天起每条简报都会被记下,下一个交易日收盘后开始回填表现。
                {storageBackend() !== "postgres" &&
                  "(当前未连数据库,记账暂不可用)"}
              </div>
            </div>
          ) : (
            <OutcomeTable rows={live} />
          )}
        </section>

        {/* 历史回测(明牌) */}
        {backtest.length > 0 && (
          <section className="mb-2">
            <h2 className="mb-2 text-sm font-semibold text-gray-700">
              历史回测 · 非实盘喊单
            </h2>
            <div className="mb-3 rounded-lg border border-amber-200 bg-amber-50 px-4 py-2.5 text-xs leading-relaxed text-amber-800">
              ⚠️ 以下为用历史行情回放同一套信号的复盘结果,<b>不是实盘喊单</b>,
              仅用于看这类信号过去大致的规律。实盘战绩只看上面那一栏。
            </div>
            <Overview stats={btStats} byImpact={btByImpact} />
            <OutcomeTable rows={backtest} />
          </section>
        )}

        <p className="mt-6 text-center text-xs text-gray-400">
          以上为历史表现复盘,不构成投资建议。历史规律不代表未来表现。
        </p>
      </main>
    </div>
  );
}

function Overview({
  stats,
  byImpact,
}: {
  stats: HitStats;
  byImpact: { impact: string; stats: HitStats }[];
}) {
  // 样本不足不亮命中率,避免几条数据的虚高/虚低误导
  const enough = stats.evaluated >= MIN_SAMPLE;
  return (
    <div className="mb-3">
      <div className="grid grid-cols-3 gap-3">
        <Stat
          label="命中率"
          value={
            !enough || stats.rate === null
              ? "—"
              : `${Math.round(stats.rate * 100)}%`
          }
          sub={!enough ? `样本积累中 ${stats.evaluated}/${MIN_SAMPLE}` : undefined}
        />
        <Stat label="已判定" value={String(stats.evaluated)} />
        <Stat label="跟上了" value={String(stats.hits)} />
      </div>
      {byImpact.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-gray-500">
          {byImpact.map(({ impact, stats: s }) => (
            <span key={impact}>
              {IMPACT_META[impact as Impact]?.emoji} {impact}影响{" "}
              {s.rate === null ? "—" : `${Math.round(s.rate * 100)}%`}{" "}
              <span className="text-gray-400">
                ({s.hits}/{s.evaluated})
              </span>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

function OutcomeTable({ rows }: { rows: OutcomeRow[] }) {
  return (
    <>
      {/* 手机:卡片(桌面隐藏) */}
      <div className="space-y-2 sm:hidden">
        {rows.map((r) => (
          <OutcomeCard key={r.id} r={r} />
        ))}
      </div>

      {/* 桌面:表格(手机隐藏) */}
      <div className="hidden overflow-hidden rounded-xl border border-gray-200 bg-white sm:block">
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
          <thead>
            <tr className="border-b border-gray-200 bg-gray-50 text-left text-xs text-gray-500">
              <Th>日期</Th>
              <Th>简报</Th>
              <Th>受益股</Th>
              <Th className="text-center">期待</Th>
              <Th className="text-right">实际</Th>
              <Th className="text-center">结果</Th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className="border-b border-gray-100 last:border-0">
                <Td className="whitespace-nowrap font-mono text-xs text-gray-500">
                  {r.date.slice(5)}
                </Td>
                <Td className="max-w-[220px] text-xs text-gray-700">
                  <span className="mr-1">{IMPACT_META[r.impact as Impact]?.emoji ?? ""}</span>
                  {r.title}
                </Td>
                <Td className="whitespace-nowrap">
                  <Link
                    href={`/stock/${r.code}`}
                    className="font-medium text-gray-900 hover:text-blue-600"
                  >
                    {r.name}
                  </Link>
                </Td>
                <Td className="text-center text-xs text-gray-500">{r.expected}</Td>
                <Td className="text-right font-mono tabular-nums">
                  {r.change === null ? (
                    <span className="text-gray-300">—</span>
                  ) : (
                    <span className={changeClass(r.change)}>
                      {fmtChange(r.change)}
                    </span>
                  )}
                </Td>
                <Td className="text-center">
                  {r.hit === null ? (
                    <span className="text-xs text-gray-300">未判定</span>
                  ) : r.hit ? (
                    <span className="text-xs font-medium text-rose-600">跟上 ✓</span>
                  ) : (
                    <span className="text-xs text-gray-400">没跟上</span>
                  )}
                </Td>
              </tr>
            ))}
          </tbody>
          </table>
        </div>
      </div>
    </>
  );
}

// 战绩卡片(移动端)
function OutcomeCard({ r }: { r: OutcomeRow }) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-3">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 text-sm text-gray-800">
          <span className="mr-1">{IMPACT_META[r.impact as Impact]?.emoji ?? ""}</span>
          {r.title}
        </div>
        <span className="shrink-0 font-mono text-xs text-gray-400">
          {r.date.slice(5)}
        </span>
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-gray-500">
        <Link
          href={`/stock/${r.code}`}
          className="font-medium text-gray-900 hover:text-blue-600"
        >
          {r.name}
        </Link>
        <span>期待{r.expected}</span>
        <span className="text-gray-300">·</span>
        <span className="inline-flex items-center gap-1">
          实际
          {r.change === null ? (
            <span className="text-gray-300">—</span>
          ) : (
            <span className={`font-mono ${changeClass(r.change)}`}>
              {fmtChange(r.change)}
            </span>
          )}
        </span>
        <span className="text-gray-300">·</span>
        {r.hit === null ? (
          <span className="text-gray-300">未判定</span>
        ) : r.hit ? (
          <span className="font-medium text-rose-600">跟上 ✓</span>
        ) : (
          <span className="text-gray-400">没跟上</span>
        )}
      </div>
    </div>
  );
}

function Stat({
  label,
  value,
  sub,
}: {
  label: string;
  value: string;
  sub?: string;
}) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white px-4 py-3 text-center">
      <div className="text-xs text-gray-400">{label}</div>
      <div className="mt-1 text-2xl font-semibold tabular-nums text-gray-900">
        {value}
      </div>
      {sub && <div className="mt-0.5 text-[11px] text-gray-400">{sub}</div>}
    </div>
  );
}

