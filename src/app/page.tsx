import Link from "next/link";
import { SiteHeader } from "@/components/SiteHeader";
import { HomeHero } from "@/components/home/HomeHero";
import { BriefingFeed } from "@/components/BriefingFeed";
import { AdminHomeFooter } from "@/components/AdminHomeFooter";
import { sentimentSnapshot } from "@/lib/sentiment";
import { buildWatchChainMap } from "@/lib/watch-relation";
import { buildRelLabelMap, resolveEventFaceLabel } from "@/lib/relation-resolver";
import {
  getBriefStatus,
  BRIEF_STATUS_UI,
  type BriefStatusRecord,
  type BriefTone,
} from "@/lib/brief-status";
import { getHolidayBridge, type HolidayBridgeDoc } from "@/lib/holiday-bridge";
import { getChain } from "@/data/chains";
import {
  listBriefing,
  latestBriefing,
  type BriefingItem,
} from "@/lib/briefings";
import { listPublishedEvents } from "@/lib/insight-pipeline/docs";
import { todayISO } from "@/lib/date";
import { DISCLAIMER } from "@/lib/constants";
import { JudgmentBoard, JudgmentReview } from "@/components/home/JudgmentBoard";
import { HomeMyStocks, type SegIntentPair } from "@/components/home/HomeMyStocks";
import { DailyTell } from "@/components/home/DailyTell";
import { MarketBar } from "@/components/home/MarketBar";
import { EventTop3 } from "@/components/home/EventTop3";
import { RecapRail } from "@/components/home/RecapRail";
import { buildDailyJudgments, buildJudgmentReview, buildChainFundTrends } from "@/lib/judgment";
import { attachChanges, composeDailyTell } from "@/lib/judgment-diff";
import { recentSnapshots } from "@/lib/market-intent/store";

// 首页 = 今日产业链推理台(首页改版 PRD):先看因果链,再看触发源,再看和我相关。
// 全局内容走 ISR(大陆 TTFB 约定,零 fetch 零 LLM);个性化(和我相关/自选)全部客户端按需取。

// 首页 canonical(SEO 旧索引修复,2026-08-14):双主机历史(vercel.app 曾与主域并行收录)
// 下必须显式声明正主。只在首页自己的 metadata 声明——放 layout 会让无 canonical 的子页
// 全部继承「canonical=/」自伤。
export const metadata = { alternates: { canonical: "/" } };
export const revalidate = 60;

export default async function Home() {
  const date = todayISO();
  let items: BriefingItem[] = [];
  let errored = false;
  // 简报 + AI链情绪快照并行。情绪只读缓存快照(纯 DB 查询、零 fetch):
  // Next 14 渲染期间碰到 no-store fetch 会把整页打成动态(ISR 报废、每请求跑函数、大陆更慢),
  // 所以首页绝不在服务端触发情绪冷算;快照过期由客户端组件后台拉 /api/chain-sentiment 刷新。
  // R12(三轮收尾):状态/桥 KV 读并进同一批(全部相互独立,一跳出全量)
  const [briefingsRes, snap, briefStatus, bridgeDoc] = await Promise.all([
    listBriefing({ date, status: "published" }).catch(() => null),
    sentimentSnapshot().catch(() => null),
    getBriefStatus(date).catch(() => null),
    getHolidayBridge(date).catch(() => null),
  ]);
  if (briefingsRes === null) errored = true;
  else items = briefingsRes;

  // 今天还没生成时,回退展示最近一期(0 点清零到次日 07:00 生成之间、以及周末/节假日,
  // 都不该给用户一片空白)。stale=true 时明确标注"今日尚未更新,以下为 X 日"。
  let shownDate = date;
  let stale = false;
  if (!errored && items.length === 0) {
    try {
      const latest = await latestBriefing();
      if (latest.items.length > 0 && latest.date) {
        items = latest.items;
        shownDate = latest.date;
        stale = true;
      }
    } catch {
      /* 取历史失败就维持空状态 */
    }
  }

  // 事件专篇入口(M2):当日已发布专篇 → 条目id→href;失败降级为空(事件卡回落链级口径)。
  // recentEvtDocs:近期专篇(跨日),底部「值得复看」右栏用。因果链卡已撤出首页(阅读路径改版)。
  const [evtDocs, recentEvtDocs] = await Promise.all([
    listPublishedEvents({ date: shownDate, limit: 10 }).catch(() => []),
    listPublishedEvents({ limit: 2 }).catch(() => []),
  ]);
  const evtMap: Record<string, string> = {};
  for (const d of evtDocs) {
    for (const itemId of d.payload.eventMeta?.itemIds ?? [])
      evtMap[itemId] = `/insight/evt/${d.slug}`;
  }
  const recapDocs = recentEvtDocs.map((d) => ({
    slug: d.slug,
    date: d.date,
    title: d.payload.eventMeta?.title ?? d.slug,
  }));
  const aiChain = getChain("ai");
  const insightHref = aiChain?.insightSlug ? `/insight/${aiChain.insightSlug}` : null;
  // 事件卡门面标签(2.2.1b):有触发源=「链级触发」(事件→链),映射档留给卡内逐票 chip
  const relations = Object.fromEntries(
    items.map((it) => [it.id, resolveEventFaceLabel(it)])
  );
  // 全 A 股→链身份(P1 和我相关结构化):服务端算好精简 map,客户端拿自选本地查
  const watchChainMap = buildWatchChainMap();
  // Daily Judgment 首屏三块(2.2.5):①三件事 ③旧判断复核(server)+ ②我的股票(client 数据底)
  // 快照取近 10 交易日一次拿全:今/昨对照(segIntent)与主线卡资金微趋势共用,不多打一跳
  const [judgmentRes, reviewEntries, intentPairSnaps] = await Promise.all([
    buildDailyJudgments().catch(() => null),
    buildJudgmentReview().catch(() => []),
    recentSnapshots(10).catch(() => []),
  ]);
  const chainTrends = buildChainFundTrends(intentPairSnaps);
  // 2.2.6 Change Detection:附加 昨日→今日 变化并按「变了的优先」重排 top3
  const judged = judgmentRes
    ? await attachChanges(judgmentRes.ymd, judgmentRes.judgments).catch(() => ({
        judgments: judgmentRes.judgments.map((j) => ({ ...j, changes: [] })),
        hadPrev: false,
      }))
    : null;
  // 「StockTell 今天怎么看」总判断(一句话 + 最值得看/最大变化/最大风险)
  const tell = judged ? composeDailyTell(judged.judgments) : null;
  // 板块意图 今/昨 对照(块② client 用;板块仅 8 个,payload 极小)
  const segIntent: Record<string, SegIntentPair> = {};
  {
    const ymds = Array.from(new Set(intentPairSnaps.map((s) => s.ymd))).sort();
    const tYmd = ymds[ymds.length - 1];
    const yYmd = ymds.length > 1 ? ymds[ymds.length - 2] : null;
    for (const s of intentPairSnaps) {
      if (s.ymd !== tYmd) continue;
      const y = yYmd
        ? intentPairSnaps.find((p) => p.ymd === yYmd && p.segment === s.segment) ?? null
        : null;
      segIntent[s.segment] = {
        t: { intent: s.intent.intent, label: s.intent.label },
        y: y ? { intent: y.intent.intent, label: y.intent.label } : null,
      };
    }
  }
  // 今日被事件点名的 A 股(块② 置顶依据)
  const namedToday = Array.from(
    new Set(items.flatMap((it) => it.beneficiaries.map((b) => b.code)))
  );
  const relLabelMap = buildRelLabelMap(); // Phase 3-D:OvernightRadar peer 关系档(服务端算好传客户端)
  // 节后首日观察(2.1-C):桥文档只在 subType 命中时渲染(多读一次 KV 在 ISR 下可忽略);
  // 回顾条目不在 bridge 区块重复——下方 stale feed 展示的就是最近一期简报,区块只补「口径+验证点」。
  const bridge = briefStatus?.subType === "holiday_bridge" ? bridgeDoc : null;

  return (
    // 视觉优化(2026-08-16 定稿→2026-08-18 校准):页面中性浅灰(#F7F8FA)、卡片纯白——
    // 分区靠边框+留白,不靠阴影;冷蓝灰底已弃。
    // 2026-08-17 负责人拍板:整页回单栏(宽幅双栏观感不和谐)——内容与导航同 max-w-3xl 栅格,
    // 模块从上到下单列流,像研究简报不像 dashboard。
    <div className="min-h-screen bg-canvas text-ink">
      <SiteHeader active="今日推理" />

      {/* 阅读路径(2026-08-14 定,2026-08-17 回单栏):从「模块排列」到「阅读路径」——
          一屏半内拿到:今天怎么看 → 我的关注变了什么 → 什么值得点。全部单列流:
          总判断 → 主线大卡(全宽)→ 次卡×2(并排一行)→ 我的关注 → 市场状态条 →
          今日事件×3 → 验证进展 → 和我相关 → 值得复看。
          注:因果链四大卡撤出首页(与核心判断信息重叠,完整版在链页/深读);
          FirstRunReorder 新手前置序随之退役——本次拍板覆盖 07-09 旧拍板。 */}
      <main className="mx-auto max-w-3xl px-4 py-6 sm:px-6">
        <HomeHero
          shownDate={shownDate}
          insightHref={insightHref}
          dataNote={judgmentRes ? `${Number(judgmentRes.ymd.slice(4, 6))}/${Number(judgmentRes.ymd.slice(6, 8))} 盘后` : undefined}
        />

        <BriefStatusBanner status={briefStatus} stale={stale} shownDate={shownDate} />

        {bridge && <HolidayBridgeSection bridge={bridge} />}

        {/* 屏1a:StockTell 今天怎么看(总判断——这才是 Tell) */}
        {judgmentRes && tell && <DailyTell ymd={judgmentRes.ymd} tell={tell} />}

        {/* 屏1b:主线 1 大 + 次线 2 小 */}
        {judgmentRes && judged && (
          <JudgmentBoard ymd={judgmentRes.ymd} judgments={judged.judgments} hadPrev={judged.hadPrev} trends={chainTrends} />
        )}

        {/* 屏1c:我的关注(上移——早上最想看的是「我关心的东西今天有什么变化」) */}
        <HomeMyStocks segIntent={segIntent} named={namedToday} watchChainMap={watchChainMap} />

        {/* 层4:市场状态一条(含板块意图分布,方案 A 并入)+ 层5:今日发生了什么 3 条 */}
        <MarketBar data={snap?.data} relMap={relLabelMap} segIntent={segIntent} />
        <EventTop3 items={items} evtMap={evtMap} chainName={aiChain?.name} insightHref={insightHref} />

        {/* 层6:今天有哪些判断被验证/推翻(空则整层消失) */}
        <JudgmentReview entries={reviewEntries} />

        {/* 层7(最后一层,到此结束):和我相关 3 条 → 值得复看(单栏堆叠) */}
        {items.length === 0 ? (
          <EmptyState errored={errored} />
        ) : (
          <div className="mt-8">
            <BriefingFeed
              items={items}
              loggedIn={false}
              insightHref={insightHref}
              chainName={aiChain?.name}
              chainHref={aiChain ? `/chain/${aiChain.id}` : undefined}
              relations={relations}
              watchChainMap={watchChainMap}
              evtMap={evtMap}
            />
            <RecapRail docs={recapDocs} />
          </div>
        )}

        <p className="mt-8 text-center text-meta leading-relaxed text-gray-400">
          我们不做新闻堆叠,也不推荐买卖。StockTell 只回答一个问题:这件事会沿着哪条产业链传导,哪些
          A 股是直接相关,哪些只是情绪映射。
        </p>
        <p className="mt-2 text-center text-meta leading-relaxed text-gray-400">{DISCLAIMER}</p>
        <AdminHomeFooter />
      </main>
    </div>
  );
}

// 简报状态横幅(2.1-A 全站五档对齐)。文案/色调统一走 BRIEF_STATUS_UI:
// 休市=中性、模板兜底/合规阻断=琥珀(需关注非事故)、failed 才大红;generated/manual_reissue 无横幅。
// 用户在首页就能读懂"今天为什么没有(正常的)新简报"。
const TONE_BANNER: Record<BriefTone, { box: string; badge: string } | null> = {
  info: null, // 正常产出不打横幅
  neutral: { box: "bg-slate-100 text-slate-600", badge: "text-slate-700" },
  attention: { box: "bg-amber-50 text-amber-800", badge: "text-amber-900" },
  warn: { box: "bg-rose-50 text-rose-700", badge: "text-rose-700" },
};

function BriefStatusBanner({
  status,
  stale,
  shownDate,
}: {
  status: BriefStatusRecord | null;
  stale: boolean;
  shownDate: string;
}) {
  const fromLatest = stale ? `,以下为最近一期 · ${shownDate}` : "";
  const ui = status ? BRIEF_STATUS_UI[status.status] : null;
  const style = ui ? TONE_BANNER[ui.tone] : null;
  if (ui && style) {
    return (
      <div className={`mb-3 rounded-lg px-4 py-2.5 text-xs leading-relaxed ${style.box}`}>
        <span className={`font-medium ${style.badge}`}>{ui.badge}</span> · {ui.note}
        {fromLatest}
      </div>
    );
  }
  if (stale) {
    return (
      <div className="mb-3 rounded-lg bg-amber-50 px-4 py-2.5 text-xs leading-relaxed text-amber-800">
        今日推理尚未更新(每个交易日北京时间约 07:00 生成),以下为最近一期 · {shownDate}。
      </div>
    );
  }
  return null;
}

// 节后首日观察(2.1-C):休市日的产业链关注环节+验证点。第一条链默认展开,其余折叠
// (原生 details,零客户端 JS,与 track 页复盘规则同款交互)。
function HolidayBridgeSection({ bridge }: { bridge: HolidayBridgeDoc }) {
  return (
    <section className="mb-4 rounded-xl border border-gray-200 bg-white p-4 shadow-sm sm:p-5">
      <h2 className="text-sm font-semibold text-gray-800">{bridge.title}</h2>
      <p className="mt-1 text-xs leading-relaxed text-gray-500">{bridge.note}</p>
      <div className="mt-3 space-y-2">
        {bridge.chainWatch.map((cw, i) => (
          <details key={cw.chainId} open={i === 0} className="group rounded-lg bg-gray-50 px-3 py-2">
            <summary className="flex cursor-pointer list-none items-center text-xs font-medium text-gray-700">
              {cw.chainName} · 今日可关注的验证点
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
            <ul className="mt-2 space-y-1.5">
              {cw.segments.map((s) => (
                <li key={s.name} className="text-xs leading-relaxed text-gray-600">
                  <span className="font-medium text-gray-700">{s.name}</span>
                  <span className="text-gray-400">({s.plain})</span> · 看:
                  {s.verify.join(" / ")}
                </li>
              ))}
            </ul>
          </details>
        ))}
      </div>
      <p className="mt-3 text-meta text-gray-400">
        以上为研究框架梳理·非确认,不构成投资建议;验证点用于观察产业链传导是否兑现,不预示涨跌。
      </p>
    </section>
  );
}

function EmptyState({ errored }: { errored: boolean }) {
  return (
    <div className="mt-5 rounded-xl border border-dashed border-gray-300 bg-white py-14 text-center">
      <div className="text-sm font-medium text-gray-500">
        {errored ? "推理数据暂时读取不到,稍后再来看看" : "今日推理还没生成"}
      </div>
      <div className="mt-1 text-xs text-gray-400">
        每个交易日北京时间约 07:00 生成。先去{" "}
        <Link href="/stocks" className="text-brand-600 hover:underline">
          股票池
        </Link>{" "}
        添加自选,推理来了第一时间看跟你相关的。
      </div>
    </div>
  );
}
