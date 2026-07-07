import { SiteHeader } from "@/components/SiteHeader";
import { FeedbackLink } from "@/components/FeedbackLink";
import { OutcomeFeed } from "@/components/OutcomeFeed";
import {
  pageOutcomes,
  statsOutcomes,
  statsOutcomesByRelation,
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
  const [liveAgg, btAgg, liveFirst, btFirst, liveRel] = await Promise.all([
    statsOutcomes(false).catch(() => ({ stats: emptyStats(), byImpact: [] })),
    statsOutcomes(true).catch(() => ({ stats: emptyStats(), byImpact: [] })),
    pageOutcomes(false, null, PAGE).catch(() => ({ rows: [], hasMore: false, nextCursor: null })),
    pageOutcomes(true, null, PAGE).catch(() => ({ rows: [], hasMore: false, nextCursor: null })),
    // 2.1-W3:按关系档/链拆复盘(只拆实盘——回测是明牌参考,不值得再细分)
    statsOutcomesByRelation(false).catch(() => ({ byRelation: [], byChain: [] })),
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
            <h1 className="text-h1 font-semibold tracking-tight">推理复盘 · 关系有没有被验证</h1>
            <FeedbackLink />
          </div>
          <p className="mt-1 text-xs leading-relaxed text-gray-400">
            复盘 StockTell 过去给出的事件、产业链关系和映射判断,看看哪些被后续市场表现验证。
            复盘的是产业链关系,不是买卖建议;历史统计不代表未来表现。
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
              复盘规则 · 验证成立 / 未验证 / 待观察 怎么算的
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
            StockTell 不复盘买卖建议,只复盘产业链关系判断:当时判断影响哪条链、哪些是直接映射、
            哪些只是情绪映射。复盘看后续市场表现是否与判断一致(基本面证据验证为 P1),落到三种状态之一:
          </p>
          <ul className="mt-2 space-y-1">
            <li>
              <Dot className="bg-rose-500" />
              <b className="text-rose-600">验证成立</b>:后续按当时判断的方向走、且当日幅度 ≥{" "}
              {HIT_THRESHOLD}%(关系被市场表现验证)
            </li>
            <li>
              <Dot className="bg-gray-400" />
              <b className="text-gray-600">未验证</b>:已复盘,但后续表现不支持当时判断(方向不对或幅度不够)
            </li>
            <li>
              <Dot className="bg-gray-300" />
              <b className="text-gray-500">待观察</b>:还没到结算时间(每交易日收盘后约 15:30),或行情取不到;不计入验证率
            </li>
          </ul>
          <p className="mt-2">
            <b className="text-gray-600">
              关系验证率 = 验证成立 ÷ 已复盘(已复盘 = 验证成立 + 未验证)
            </b>
            。历史统计只评估推理质量、不代表未来收益,复盘的是产业链关系不是买卖建议。
          </p>
        </details>

        {/* 实盘记录 */}
        <section className="mb-8">
          <h2 className="mb-2 text-sm font-semibold text-gray-700">
            实盘记录 · 自动记账起
          </h2>
          <Overview stats={liveStats} byImpact={liveByImpact} />
          <RelationBreakdown byRelation={liveRel.byRelation} byChain={liveRel.byChain} />
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

// 按关系档 / 按链拆复盘(2.1-W3):复盘的主口径=「哪类关系判断被验证」,不是笼统的涨跌命中。
// direct 与 sentiment 的验证含义不同:direct 未验证要复核订单/收入证据(高频未验证会自动进
// 审阅队列),sentiment 未验证多半是情绪衰减(符合预期)。历史同向统计只是参考、非基本面验证。
// 亮百分比的最低样本(二轮 review N2):与 linkage-rules.md §6 红线同口径——历史同向类统计
// 小样本(<12)只给样本数不亮百分比(OvernightRadar 的 LINKAGE_MIN 同为 12)。此前硬编码 5
// 与红线自相矛盾,拆掉了"小样本不亮百分比"这层合规防线。
const REL_MIN_SAMPLE = 12;

const REL_META: Record<string, { label: string; verifyHint: string }> = {
  direct: { label: "直接映射", verifyHint: "看订单/客户/收入占比/毛利率" },
  indirect: { label: "间接映射", verifyHint: "看环节变化与业务披露" },
  sentiment: { label: "情绪映射", verifyHint: "看情绪是否衰减、有无基本面传导" },
  weak: { label: "弱映射", verifyHint: "外围观察,评估是否保留" },
  candidate: { label: "待验证", verifyHint: "候选池,证据不足未归档" },
  trigger: { label: "触发源", verifyHint: "看是否引发链级事件" },
  unmapped: { label: "未覆盖", verifyHint: "尚无关系档,待验证收录" },
};

function RelationBreakdown({
  byRelation,
  byChain,
}: {
  byRelation: { relationType: string; stats: HitStats }[];
  byChain: { chainId: string; stats: HitStats }[];
}) {
  if (byRelation.length === 0) return null;
  return (
    <div className="mb-3 rounded-xl bg-white p-4 shadow-sm sm:p-5">
      <h3 className="text-xs font-semibold text-gray-700">按关系档复盘 · 哪类判断被验证了</h3>
      <div className="mt-2 space-y-1.5">
        {byRelation.map(({ relationType, stats }) => {
          const meta = REL_META[relationType] ?? { label: relationType, verifyHint: "" };
          const showPct = stats.evaluated >= REL_MIN_SAMPLE && stats.rate !== null;
          return (
            <div key={relationType} className="flex items-baseline gap-2 text-xs">
              <span className="w-16 shrink-0 font-medium text-gray-700">{meta.label}</span>
              <span className="tabular-nums text-gray-600">
                {showPct ? `验证 ${Math.round(stats.rate! * 100)}%` : "样本积累中"}
                <span className="text-gray-400">
                  ({stats.hits}/{stats.evaluated})
                </span>
              </span>
              <span className="min-w-0 truncate text-meta text-gray-400">{meta.verifyHint}</span>
            </div>
          );
        })}
      </div>
      {byChain.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 border-t border-gray-100 pt-3 text-xs text-gray-500">
          {byChain.map(({ chainId, stats }) => (
            <span key={chainId}>
              {chainId} ·{" "}
              {stats.evaluated >= REL_MIN_SAMPLE && stats.rate !== null
                ? `验证 ${Math.round(stats.rate * 100)}% `
                : ""}
              <span className="text-gray-400">
                ({stats.hits}/{stats.evaluated})
              </span>
            </span>
          ))}
        </div>
      )}
      <p className="mt-2 text-meta leading-relaxed text-gray-400">
        以上为历史同向统计(市场表现是否与判断同向),供参考、降权使用;不等于基本面验证,不预测未来。
        直接映射高频未验证的关系会进入人工审阅队列复核,关系档不会被统计自动调整。
      </p>
    </div>
  );
}

// 图例小圆点:颜色与明细表的有效/未联动/未判定一一对应
function Dot({ className }: { className: string }) {
  return (
    <span
      className={`mr-1.5 inline-block h-1.5 w-1.5 rounded-full align-middle ${className}`}
    />
  );
}

// 分项(高/中/低联动)亮百分比的最低样本——比总体 MIN_SAMPLE 宽松,但仍挡掉 1/1 这种虚高
const SUB_MIN_SAMPLE = 5;

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
        {/* 主视觉:关系验证率(大数字) */}
        <div className="min-w-0">
          <div className="text-xs text-gray-400">关系验证率</div>
          <div className="mt-0.5 text-4xl font-semibold leading-none tabular-nums text-gray-900">
            {pct === null ? "—" : `${pct}%`}
          </div>
          {!enough && (
            <div className="mt-1 text-meta text-gray-400">
              样本积累中 {stats.evaluated}/{MIN_SAMPLE}
            </div>
          )}
        </div>
        {/* 旁注:已复盘 / 验证成立 */}
        <div className="shrink-0 space-y-1 text-right text-xs text-gray-500">
          <div>
            已复盘{" "}
            <b className="font-semibold tabular-nums text-gray-800">
              {stats.evaluated}
            </b>
          </div>
          <div>
            验证成立{" "}
            <b className="font-semibold tabular-nums text-rose-600">
              {stats.hits}
            </b>
          </div>
        </div>
      </div>

      {/* 常驻口径说明(不折叠):防止大数字被读成"荐股胜率/买入能赚" */}
      <p className="mt-2 text-meta leading-relaxed text-gray-500">
        指过去的产业链关系判断被后续市场表现验证的比例,复盘的是产业链关系、不是荐股胜率,也不预示你买入的收益。
      </p>

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
          {byImpact.map(({ impact, stats: s }) => {
            // 分项样本太少不亮百分比(避免 100%(1/1) 这种虚高,与上方"样本积累中"自相矛盾)
            const showPct = s.evaluated >= SUB_MIN_SAMPLE && s.rate !== null;
            return (
              <span key={impact}>
                {IMPACT_META[impact as Impact]?.emoji} {impact}·验证{" "}
                {showPct ? `${Math.round(s.rate! * 100)}% ` : ""}
                <span className="text-gray-400">
                  ({s.hits}/{s.evaluated})
                </span>
              </span>
            );
          })}
        </div>
      )}
    </div>
  );
}

