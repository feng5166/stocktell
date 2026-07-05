import Link from "next/link";
import { SiteHeader } from "@/components/SiteHeader";
import { HomeHero } from "@/components/home/HomeHero";
import { ReasoningCards } from "@/components/home/ReasoningCards";
import { BriefingFeed } from "@/components/BriefingFeed";
import { ChainSentiment } from "@/components/ChainSentiment";
import { OvernightRadar } from "@/components/OvernightRadar";
import { ChainHomeEntry } from "@/components/chain/ChainHomeEntry";
import { AdminHomeFooter } from "@/components/AdminHomeFooter";
import { sentimentSnapshot } from "@/lib/sentiment";
import { buildReasoningCards } from "@/lib/home-feed";
import { relationLabelFor } from "@/lib/relation";
import { buildWatchChainMap } from "@/lib/watch-relation";
import { buildRelLabelMap } from "@/lib/relation-resolver";
import { getChain } from "@/data/chains";
import {
  listBriefing,
  latestBriefing,
  type BriefingItem,
} from "@/lib/briefings";
import { todayISO } from "@/lib/date";
import { DISCLAIMER } from "@/lib/constants";

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
  const [briefingsRes, snap] = await Promise.all([
    listBriefing({ date, status: "published" }).catch(() => null),
    sentimentSnapshot().catch(() => null),
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
  const cards = await buildReasoningCards(items, shownDate, stale).catch(() => []);
  const aiChain = getChain("ai");
  const insightHref = aiChain?.insightSlug ? `/insight/${aiChain.insightSlug}` : null;
  // 事件卡关系标签(替代「高影响」):服务端按 insight 人工核过的关系分级推导
  const relations = Object.fromEntries(
    items.map((it) => [it.id, relationLabelFor(it)])
  );
  // 全 A 股→链身份(P1 和我相关结构化):服务端算好精简 map,客户端拿自选本地查
  const watchChainMap = buildWatchChainMap();
  const relLabelMap = buildRelLabelMap(); // Phase 3-D:OvernightRadar peer 关系档(服务端算好传客户端)

  return (
    <div className="min-h-screen bg-canvas text-ink">
      <SiteHeader active="今日推理" />

      <main className="mx-auto max-w-3xl px-4 py-6 sm:px-6">
        <HomeHero shownDate={shownDate} insightHref={insightHref} />

        {stale && (
          <div className="mb-3 rounded-lg bg-amber-50 px-4 py-2.5 text-xs leading-relaxed text-amber-800">
            今日推理尚未更新(每个交易日北京时间约 07:00 生成),以下为最近一期 · {shownDate}。
          </div>
        )}

        {/* 1. 今日最重要的因果链(P0 一张真卡;chains.ts 加链自动进卡位) */}
        <ReasoningCards cards={cards} />

        {/* 2. 降位保留(拍板⑦):链情绪 + 隔夜事件雷达(今日触发源;P2 热力上线后评估去留) */}
        <div className="mt-5">
          <ChainSentiment
            initial={snap?.data}
            refresh={snap ? !snap.fresh : false}
            action={<ChainHomeEntry />}
          />
        </div>
        <OvernightRadar relMap={relLabelMap} />

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
