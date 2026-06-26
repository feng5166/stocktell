import Link from "next/link";
import {
  listOutcomes,
  summarize,
  HIT_THRESHOLD,
  type OutcomeRow,
} from "@/lib/outcomes";
import { storageBackend } from "@/lib/briefings";

export const dynamic = "force-dynamic";

// A股惯例:红涨绿跌
function changeClass(v: number) {
  if (v > 0) return "text-rose-600";
  if (v < 0) return "text-emerald-600";
  return "text-gray-400";
}
function fmtChange(v: number) {
  return `${v > 0 ? "+" : ""}${v.toFixed(2)}%`;
}

const IMPACT_DOT: Record<string, string> = { 高: "🔴", 中: "🟡", 低: "🟢" };

export default async function TrackPage() {
  const live = await listOutcomes(300, false).catch(() => []);
  const backtest = await listOutcomes(300, true).catch(() => []);
  const liveStats = summarize(live);
  const btStats = summarize(backtest);

  return (
    <div className="min-h-screen bg-[#f7f8fa] text-[#1a1d24]">
      <header className="border-b border-gray-200 bg-white">
        <div className="mx-auto flex max-w-3xl items-center justify-between px-4 py-3 sm:px-6">
          <Link href="/" className="text-lg font-bold tracking-tight">
            StockTell
          </Link>
          <nav className="flex items-center gap-4 text-sm text-gray-500">
            <Link href="/" className="hover:text-gray-900">
              今日简报
            </Link>
            <Link href="/stocks" className="hover:text-gray-900">
              股票池
            </Link>
            <span className="cursor-default font-medium text-gray-900">战绩</span>
          </nav>
        </div>
      </header>

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
          <Overview stats={liveStats} />
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
            <Overview stats={btStats} />
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
}: {
  stats: { rate: number | null; evaluated: number; hits: number };
}) {
  return (
    <div className="mb-3 grid grid-cols-3 gap-3">
      <Stat
        label="命中率"
        value={stats.rate === null ? "—" : `${Math.round(stats.rate * 100)}%`}
      />
      <Stat label="已判定" value={String(stats.evaluated)} />
      <Stat label="跟上了" value={String(stats.hits)} />
    </div>
  );
}

function OutcomeTable({ rows }: { rows: OutcomeRow[] }) {
  return (
    <div className="overflow-hidden rounded-xl border border-gray-200 bg-white">
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
                  <span className="mr-1">{IMPACT_DOT[r.impact] ?? ""}</span>
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
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white px-4 py-3 text-center">
      <div className="text-xs text-gray-400">{label}</div>
      <div className="mt-1 text-2xl font-semibold tabular-nums text-gray-900">
        {value}
      </div>
    </div>
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
