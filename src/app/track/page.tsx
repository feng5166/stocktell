import { SiteHeader } from "@/components/SiteHeader";
import { FeedbackLink } from "@/components/FeedbackLink";
import { OutcomeFeed } from "@/components/OutcomeFeed";
import {
  pageOutcomes,
  statsOutcomes,
  HIT_THRESHOLD,
  MIN_SAMPLE,
  type HitStats,
} from "@/lib/outcomes";
import { storageBackend, type Impact } from "@/lib/briefings";
import { IMPACT_META } from "@/lib/impact";

export const dynamic = "force-dynamic";

const PAGE = 20;

export default async function TrackPage() {
  // 真分页:服务端只取首页 + 轻量统计;其余滚动时由 OutcomeFeed 向 /api/outcomes 拉
  const [liveAgg, btAgg, liveFirst, btFirst] = await Promise.all([
    statsOutcomes(false).catch(() => ({ stats: emptyStats(), byImpact: [] })),
    statsOutcomes(true).catch(() => ({ stats: emptyStats(), byImpact: [] })),
    pageOutcomes(false, null, PAGE).catch(() => ({ rows: [], hasMore: false, nextCursor: null })),
    pageOutcomes(true, null, PAGE).catch(() => ({ rows: [], hasMore: false, nextCursor: null })),
  ]);
  const liveStats = liveAgg.stats;
  const btStats = btAgg.stats;
  const liveByImpact = liveAgg.byImpact;
  const btByImpact = btAgg.byImpact;

  return (
    <div className="min-h-screen bg-canvas text-ink">
      <SiteHeader active="战绩" />

      <main className="mx-auto max-w-3xl px-4 py-6 sm:px-6">
        <div className="mb-4">
          <div className="flex items-center gap-2.5">
            <h1 className="text-h1 font-semibold tracking-tight">查账 · 我准不准</h1>
            <FeedbackLink />
          </div>
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
          {liveFirst.rows.length === 0 ? (
            <div className="rounded-xl border border-dashed border-gray-300 bg-white py-12 text-center">
              <div className="text-sm font-medium text-gray-500">还在积累中</div>
              <div className="mt-1 text-xs text-gray-400">
                从今天起每条简报都会被记下,下一个交易日收盘后开始回填表现。
                {storageBackend() !== "postgres" &&
                  "(当前未连数据库,记账暂不可用)"}
              </div>
            </div>
          ) : (
            <OutcomeFeed
              backtest={false}
              initial={liveFirst.rows}
              initialHasMore={liveFirst.hasMore}
            />
          )}
        </section>

        {/* 历史回测(明牌) */}
        {btFirst.rows.length > 0 && (
          <section className="mb-2">
            <h2 className="mb-2 text-sm font-semibold text-gray-700">
              历史回测 · 非实盘喊单
            </h2>
            <div className="mb-3 rounded-lg border border-amber-200 bg-amber-50 px-4 py-2.5 text-xs leading-relaxed text-amber-800">
              ⚠️ 以下为用历史行情回放同一套信号的复盘结果,<b>不是实盘喊单</b>,
              仅用于看这类信号过去大致的规律。实盘战绩只看上面那一栏。
            </div>
            <Overview stats={btStats} byImpact={btByImpact} />
            <OutcomeFeed
              backtest={true}
              initial={btFirst.rows}
              initialHasMore={btFirst.hasMore}
            />
          </section>
        )}

        <p className="mt-6 text-center text-xs text-gray-400">
          以上为历史表现复盘,不构成投资建议。历史规律不代表未来表现。
        </p>
      </main>
    </div>
  );
}

function emptyStats(): HitStats {
  return { evaluated: 0, hits: 0, rate: null };
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
    <div className="rounded-xl bg-white shadow-sm px-4 py-3 text-center">
      <div className="text-xs text-gray-400">{label}</div>
      <div className="mt-1 text-display font-semibold tabular-nums text-gray-900">
        {value}
      </div>
      {sub && <div className="mt-0.5 text-meta text-gray-400">{sub}</div>}
    </div>
  );
}

