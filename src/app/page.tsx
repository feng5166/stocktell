import Link from "next/link";
import { SiteHeader } from "@/components/SiteHeader";
import { HomeHero } from "@/components/home/HomeHero";
import { FirstRunReorder } from "@/components/home/FirstRunReorder";
import { ReasoningCards } from "@/components/home/ReasoningCards";
import { BriefingFeed } from "@/components/BriefingFeed";
import { ChainSentiment } from "@/components/ChainSentiment";
import { OvernightRadar } from "@/components/OvernightRadar";
import { ChainHomeEntry } from "@/components/chain/ChainHomeEntry";
import { ShareCardEntry } from "@/components/share/ShareCardEntry";
import { AdminHomeFooter } from "@/components/AdminHomeFooter";
import { sentimentSnapshot } from "@/lib/sentiment";
import { buildReasoningCards } from "@/lib/home-feed";
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
import { HomeIntentStrip, type HomeIntentRow } from "@/components/HomeIntentStrip";
import { latestSnapshots } from "@/lib/market-intent/store";
import { SEGMENT_BY_KEY } from "@/lib/market-intent/segments";
import { INTENT_SEVERITY } from "@/lib/market-intent/ui";

// 首页 = 今日产业链推理台(首页改版 PRD):先看因果链,再看触发源,再看和我相关。
// 全局内容走 ISR(大陆 TTFB 约定,零 fetch 零 LLM);个性化(和我相关/自选)全部客户端按需取。
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

  // 因果链卡:结构读 insight,今日判断读 chain-take(纯 DB 读;失败降级为空数组,不炸页不显假0)
  // 事件专篇入口(M2):当日已发布专篇 → 条目id→href;失败降级为空(事件卡回落链级口径)
  const [cards, evtDocs] = await Promise.all([
    buildReasoningCards(items, shownDate, stale).catch(() => []),
    listPublishedEvents({ date: shownDate, limit: 10 }).catch(() => []),
  ]);
  const evtMap: Record<string, string> = {};
  for (const d of evtDocs) {
    for (const itemId of d.payload.eventMeta?.itemIds ?? [])
      evtMap[itemId] = `/insight/evt/${d.slug}`;
  }
  const aiChain = getChain("ai");
  const insightHref = aiChain?.insightSlug ? `/insight/${aiChain.insightSlug}` : null;
  // 事件卡门面标签(2.2.1b):有触发源=「链级触发」(事件→链),映射档留给卡内逐票 chip
  const relations = Object.fromEntries(
    items.map((it) => [it.id, resolveEventFaceLabel(it)])
  );
  // 全 A 股→链身份(P1 和我相关结构化):服务端算好精简 map,客户端拿自选本地查
  const watchChainMap = buildWatchChainMap();
  // 今日资金意图(2.2.3):3 条链的链级摘要——每链取信息量最高的板块判定,完整数据在链页
  const intentLatest = await latestSnapshots().catch(() => null);
  const INTENT_HOME_CHAINS: { slug: string; name: string; href: string }[] = [
    { slug: "ai-infra", name: "AI 推理基础设施", href: "/chain/ai#market-intent" },
    { slug: "datacenter-power", name: "数据中心电力", href: "/chain/data-center-power#market-intent" },
    { slug: "ai-application", name: "AI 应用", href: "/chain/ai#market-intent" },
  ];
  const intentRows: HomeIntentRow[] = [];
  if (intentLatest) {
    for (const c of INTENT_HOME_CHAINS) {
      const segs = intentLatest.snaps.filter((s) =>
        SEGMENT_BY_KEY[s.segment]?.chainSlugs.includes(c.slug)
      );
      if (segs.length === 0) continue;
      const top = segs
        .slice()
        .sort((a, b) => INTENT_SEVERITY[a.intent.intent] - INTENT_SEVERITY[b.intent.intent])[0];
      intentRows.push({
        chainName: c.name,
        href: c.href,
        intent: top.intent.intent,
        label: top.intent.label,
        confidence: top.intent.confidence,
        segmentName: segs.length > 1 ? SEGMENT_BY_KEY[top.segment]?.name ?? null : null,
      });
    }
  }
  const relLabelMap = buildRelLabelMap(); // Phase 3-D:OvernightRadar peer 关系档(服务端算好传客户端)
  // 节后首日观察(2.1-C):桥文档只在 subType 命中时渲染(多读一次 KV 在 ISR 下可忽略);
  // 回顾条目不在 bridge 区块重复——下方 stale feed 展示的就是最近一期简报,区块只补「口径+验证点」。
  const bridge = briefStatus?.subType === "holiday_bridge" ? bridgeDoc : null;

  return (
    <div className="min-h-screen bg-canvas text-ink">
      <SiteHeader active="今日推理" />

      <main className="mx-auto max-w-3xl px-4 py-6 sm:px-6">
        <HomeHero shownDate={shownDate} insightHref={insightHref} />

        <BriefStatusBanner status={briefStatus} stale={stale} shownDate={shownDate} />

        {bridge && <HolidayBridgeSection bridge={bridge} />}

        {/* 链情绪+雷达 与 因果链 的顺序按访客态翻转(新手路径 v2):
            老访客/有自选 = 盘面在前(负责人 2026-07-09 拍板);新访客 = 因果链演示在前 */}
        <FirstRunReorder
          market={
            <>
              <div className="mt-2">
                <ChainSentiment
                  initial={snap?.data}
                  refresh={snap ? !snap.fresh : false}
                  action={
                    <span className="inline-flex items-center gap-3">
                      <ShareCardEntry />
                      <ChainHomeEntry />
                    </span>
                  }
                />
              </div>
              <OvernightRadar relMap={relLabelMap} />
            </>
          }
          demo={
            <div className="mt-5">
              <ReasoningCards cards={cards} />
            </div>
          }
        />

        {/* 今日资金意图(2.2.3):3 条链摘要,主阵地在链页 */}
        {intentLatest && <HomeIntentStrip rows={intentRows} ymd={intentLatest.ymd} />}

        {/* 3. 和我相关(P0 原样保留)+ 4. 今日关键事件推理列表 */}
        {items.length === 0 ? (
          <EmptyState errored={errored} />
        ) : (
          <div className="mt-5">
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
          </div>
        )}

        <p className="mt-8 text-center text-xs leading-relaxed text-gray-400">
          我们不做新闻堆叠,也不推荐买卖。StockTell 只回答一个问题:这件事会沿着哪条产业链传导,哪些
          A 股是直接相关,哪些只是情绪映射。
        </p>
        <p className="mt-2 text-center text-xs leading-relaxed text-gray-400">{DISCLAIMER}</p>
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
    <section className="mb-4 rounded-xl bg-white p-4 shadow-sm sm:p-5">
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
