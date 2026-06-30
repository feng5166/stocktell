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

// 战绩是全局、非个性化数据(回填随收盘后 cron 更新),无需 force-dynamic 每次跑函数+查库。
// 改 ISR:走 Vercel 边缘缓存,5 分钟再生成一次 —— 大陆用户更快,DB 压力更小。
export const revalidate = 300;

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
      <SiteHeader active="复盘" />

      <main className="mx-auto max-w-3xl px-4 py-6 sm:px-6">
        <div className="mb-4">
          <div className="flex items-center gap-2.5">
            <h1 className="text-h1 font-semibold tracking-tight">信号复盘 · 联动有效率</h1>
            <FeedbackLink />
          </div>
          <p className="mt-1 text-xs text-gray-400">
            每条简报关联的 A 股,当日收盘后回填实际表现,复盘这类联动过去大致的有效程度。记了就敢给你查。
          </p>
        </div>

        {/* 规则 + 三态图例:默认折叠,点 ⓘ 展开(原生 details,无需客户端 JS) */}
        <details className="group mb-5 rounded-lg bg-gray-100 px-4 py-3 text-xs leading-relaxed text-gray-500">
          <summary className="flex cursor-pointer list-none items-center gap-1.5 text-gray-500 transition-colors hover:text-gray-700">
            <svg
              viewBox="0 0 20 20"
              fill="currentColor"
              className="h-4 w-4 shrink-0 text-gray-400"
            >
              <path
                fillRule="evenodd"
                d="M10 18a8 8 0 100-16 8 8 0 000 16zM9 9a1 1 0 012 0v4a1 1 0 11-2 0V9zm1-4.25a1.1 1.1 0 100 2.2 1.1 1.1 0 000-2.2z"
                clipRule="evenodd"
              />
            </svg>
            <span className="font-medium">
              判定规则 · 有效 / 未联动 / 未判定 怎么算的
            </span>
            <svg
              viewBox="0 0 20 20"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.6"
              className="ml-auto h-4 w-4 shrink-0 text-gray-300 transition-transform group-open:rotate-180"
            >
              <path d="M6 8l4 4 4-4" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </summary>
          <p className="mt-3">
            触发美股涨 → 预期对应 A 股涨,跌 → 预期跌。每只关联股当日收盘后,落到下面三种状态之一:
          </p>
          <ul className="mt-2 space-y-1">
            <li>
              <Dot className="bg-rose-500" />
              <b className="text-rose-600">有效</b>:实际按预期方向走、且当日涨跌幅 ≥{" "}
              {HIT_THRESHOLD}%(联动成立)
            </li>
            <li>
              <Dot className="bg-gray-400" />
              <b className="text-gray-600">未联动</b>:已判定,但没达到上面的标准(方向不对或幅度不够)
            </li>
            <li>
              <Dot className="bg-gray-300" />
              <b className="text-gray-500">未判定</b>:还没到结算时间(每个交易日收盘后约 15:30 结算),或当日行情取不到;不计入有效率
            </li>
          </ul>
          <p className="mt-2">
            <b className="text-gray-600">
              联动有效率 = 有效 ÷ 已判定(已判定 = 有效 + 未联动)
            </b>
            。早期样本少会波动,仅为历史复盘、不构成投资建议。
          </p>
        </details>

        {/* 实盘记录 */}
        <section className="mb-8">
          <h2 className="mb-2 text-sm font-semibold text-gray-700">
            实盘记录 · 自动记账起
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
              历史回测 · 非实盘信号
            </h2>
            <div className="mb-3 rounded-lg border border-amber-200 bg-amber-50 px-4 py-2.5 text-xs leading-relaxed text-amber-800">
              ⚠️ 以下为用历史行情回放同一套信号的复盘结果,<b>不是实盘信号</b>,
              仅用于看这类联动过去大致的规律。实盘记录只看上面那一栏。
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

// 图例小圆点:颜色与明细表的有效/未联动/未判定一一对应
function Dot({ className }: { className: string }) {
  return (
    <span
      className={`mr-1.5 inline-block h-1.5 w-1.5 rounded-full align-middle ${className}`}
    />
  );
}

function Overview({
  stats,
  byImpact,
}: {
  stats: HitStats;
  byImpact: { impact: string; stats: HitStats }[];
}) {
  // 样本不足不亮有效率,避免几条数据的虚高/虚低误导
  const enough = stats.evaluated >= MIN_SAMPLE;
  const pct =
    enough && stats.rate !== null ? Math.round(stats.rate * 100) : null;
  return (
    <div className="mb-3 rounded-xl bg-white p-4 shadow-sm sm:p-5">
      <div className="flex items-end justify-between gap-4">
        {/* 主视觉:联动有效率(大数字) */}
        <div className="min-w-0">
          <div className="text-xs text-gray-400">联动有效率</div>
          <div className="mt-0.5 text-4xl font-semibold leading-none tabular-nums text-gray-900">
            {pct === null ? "—" : `${pct}%`}
          </div>
          {!enough && (
            <div className="mt-1 text-meta text-gray-400">
              样本积累中 {stats.evaluated}/{MIN_SAMPLE}
            </div>
          )}
        </div>
        {/* 旁注:已判定 / 有效联动 */}
        <div className="shrink-0 space-y-1 text-right text-xs text-gray-500">
          <div>
            已判定{" "}
            <b className="font-semibold tabular-nums text-gray-800">
              {stats.evaluated}
            </b>
          </div>
          <div>
            有效联动{" "}
            <b className="font-semibold tabular-nums text-rose-600">
              {stats.hits}
            </b>
          </div>
        </div>
      </div>

      {/* 进度条:有效率可视化 */}
      {pct !== null && (
        <div className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-gray-100">
          <div
            className="h-full rounded-full bg-rose-400"
            style={{ width: `${pct}%` }}
          />
        </div>
      )}

      {byImpact.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 border-t border-gray-100 pt-3 text-xs text-gray-500">
          {byImpact.map(({ impact, stats: s }) => (
            <span key={impact}>
              {IMPACT_META[impact as Impact]?.emoji} {impact}联动{" "}
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

