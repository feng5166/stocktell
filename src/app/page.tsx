import Link from "next/link";
import { SiteHeader } from "@/components/SiteHeader";
import { FeedbackLink } from "@/components/FeedbackLink";
import { BriefingFeed } from "@/components/BriefingFeed";
import { ChainSentiment } from "@/components/ChainSentiment";
import { OvernightRadar } from "@/components/OvernightRadar";
import { ChainHomeEntry } from "@/components/chain/ChainHomeEntry";
import { AdminHomeFooter } from "@/components/AdminHomeFooter";
import { chainSentiment } from "@/lib/sentiment";
import {
  listBriefing,
  latestBriefing,
  type BriefingItem,
} from "@/lib/briefings";
import { todayISO } from "@/lib/date";
import { DISCLAIMER } from "@/lib/constants";

// 首页简报是全局内容(各人相同),改 ISR 走 Vercel 边缘缓存(大陆用户 TTFB 大幅下降)。
// 个性化「和我相关」与管理员入口都交给客户端按需取(BriefingFeed 客户端拉自选;
// AdminHomeFooter 客户端问 /api/me/is-admin)—— 代价是「和我相关」首屏会短暂"加载中"。
export const revalidate = 60;

export default async function Home() {
  const date = todayISO();
  let items: BriefingItem[] = [];
  let errored = false;
  // 简报 + AI链情绪并行算(情绪是全局数据,ISR 时烘进 HTML,客户端零请求)
  const [briefingsRes, sentiment] = await Promise.all([
    listBriefing({ date, status: "published" }).catch(() => null),
    chainSentiment().catch(() => ({ date: null, a: null, us: null })),
  ]);
  if (briefingsRes === null) errored = true;
  else items = briefingsRes;

  // 今天还没生成简报时,回退展示最近一期(0 点清零到次日 07:00 生成之间、以及周末/节假日,
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

  return (
    <div className="min-h-screen bg-canvas text-ink">
      <SiteHeader active="今日简报" />

      <main className="mx-auto max-w-3xl px-4 py-6 sm:px-6">
        <div className="mb-4 flex items-end justify-between">
          <div>
            <div className="flex items-center gap-2.5">
              <h1 className="text-h1 font-semibold tracking-tight">今日简报</h1>
              <FeedbackLink />
            </div>
            <p className="mt-1 text-xs text-gray-400">
              {shownDate} · AI 产业链动态,跟你的持仓有什么关系
              {/* 内联小入口 → AI 链落地页(埋点 chain_entry_click) */}
              <ChainHomeEntry />
            </p>
          </div>
        </div>

        {stale && (
          <div className="mb-3 rounded-lg bg-amber-50 px-4 py-2.5 text-xs leading-relaxed text-amber-800">
            今日简报尚未更新(每个交易日北京时间约 07:00 生成),以下为最近一期 · {shownDate}。
          </div>
        )}

        {/* 今天大盘体感(归入今日简报模块,先看情绪再看条目) */}
        <ChainSentiment initial={sentiment} />

        {/* 跨市场预期差雷达:隔夜美股已涨、对应 A 股暂未跟上 → 一屏直达(无 live 信号时自隐藏) */}
        <OvernightRadar />

        {items.length === 0 ? (
          <EmptyState errored={errored} />
        ) : (
          <BriefingFeed items={items} loggedIn={false} />
        )}

        <p className="mt-6 text-center text-xs text-gray-400">
          {DISCLAIMER}
        </p>
        <AdminHomeFooter />
      </main>
    </div>
  );
}

function EmptyState({ errored }: { errored: boolean }) {
  return (
    <div className="rounded-xl border border-dashed border-gray-300 bg-white py-14 text-center">
      <div className="text-sm font-medium text-gray-500">
        {errored ? "简报暂时读取不到,稍后再来看看" : "今日简报还没生成"}
      </div>
      <div className="mt-1 text-xs text-gray-400">
        每个交易日北京时间约 07:00 生成。先去{" "}
        <Link href="/stocks" className="text-brand-600 hover:underline">
          股票池
        </Link>{" "}
        添加自选,简报来了第一时间看跟你相关的。
      </div>
    </div>
  );
}
