import Link from "next/link";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { SiteHeader } from "@/components/SiteHeader";
import { BriefingFeed } from "@/components/BriefingFeed";
import { ChainSentiment } from "@/components/ChainSentiment";
import {
  listBriefing,
  latestBriefing,
  storageBackend,
  type BriefingItem,
} from "@/lib/briefings";
import { todayISO } from "@/lib/date";
import { DISCLAIMER } from "@/lib/constants";
import { listWatchlist } from "@/lib/watchlist";
import { isAdminSession } from "@/lib/admin";

export const dynamic = "force-dynamic";

export default async function Home() {
  const session = await getServerSession(authOptions);
  const userId = session?.user?.id ?? null;
  const loggedIn = !!userId;
  const date = todayISO();
  let items: BriefingItem[] = [];
  let errored = false;
  // 并行:简报 + 登录用户的自选。自选服务端预取后注入 BriefingFeed,
  // 客户端不必再走 session→/api/watchlist 一跳,"和我相关"首屏即按自选切分(P0-2)。
  const [briefingsRes, initialCodes] = await Promise.all([
    listBriefing({ date, status: "published" }).catch(() => null),
    userId ? listWatchlist(userId).catch(() => null) : Promise.resolve(null),
  ]);
  if (briefingsRes === null) errored = true;
  else items = briefingsRes;
  const isAdmin = await isAdminSession(); // 后台入口/存储信息只给管理员看

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
            <h1 className="text-h1 font-semibold tracking-tight">今日简报</h1>
            <p className="mt-1 text-xs text-gray-400">
              {shownDate} · AI 产业链动态,跟你的持仓有什么关系
            </p>
          </div>
        </div>

        {stale && (
          <div className="mb-3 rounded-lg bg-amber-50 px-4 py-2.5 text-xs leading-relaxed text-amber-800">
            今日简报尚未更新(每个交易日北京时间约 07:00 生成),以下为最近一期 · {shownDate}。
          </div>
        )}

        {/* 今天大盘体感(归入今日简报模块,先看情绪再看条目) */}
        <ChainSentiment />

        {items.length === 0 ? (
          <EmptyState errored={errored} isAdmin={isAdmin} />
        ) : (
          <BriefingFeed
            items={items}
            loggedIn={loggedIn}
            initialCodes={initialCodes ?? undefined}
          />
        )}

        <p className="mt-6 text-center text-xs text-gray-400">
          {DISCLAIMER}
        </p>
        {isAdmin && (
          <p className="mt-2 text-center text-meta text-gray-300">
            存储:{storageBackend() === "postgres" ? "Vercel Postgres" : "本地(未连数据库)"} ·{" "}
            <Link href="/admin/briefing" className="hover:text-gray-500">
              后台
            </Link>
          </p>
        )}
      </main>
    </div>
  );
}

function EmptyState({ errored, isAdmin }: { errored: boolean; isAdmin: boolean }) {
  return (
    <div className="rounded-xl border border-dashed border-gray-300 bg-white py-14 text-center">
      <div className="text-sm font-medium text-gray-500">
        {errored ? "简报暂时读取不到,稍后再来看看" : "今日简报还没生成"}
      </div>
      {isAdmin ? (
        <div className="mt-1 text-xs text-gray-400">
          去{" "}
          <Link href="/admin/briefing" className="text-brand-600 hover:underline">
            后台
          </Link>{" "}
          生成并发布今日简报
        </div>
      ) : (
        <div className="mt-1 text-xs text-gray-400">
          每个交易日北京时间约 07:00 生成。先去{" "}
          <Link href="/stocks" className="text-brand-600 hover:underline">
            股票池
          </Link>{" "}
          添加自选,简报来了第一时间看跟你相关的。
        </div>
      )}
    </div>
  );
}
