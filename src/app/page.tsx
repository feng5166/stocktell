import Link from "next/link";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { AuthStatus } from "@/components/auth/AuthStatus";
import { BriefingFeed } from "@/components/BriefingFeed";
import {
  listBriefing,
  latestBriefing,
  storageBackend,
  type BriefingItem,
} from "@/lib/briefings";

export const dynamic = "force-dynamic";

function todayISO(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

export default async function Home() {
  const session = await getServerSession(authOptions);
  const loggedIn = !!session;
  const date = todayISO();
  let items: BriefingItem[] = [];
  let errored = false;
  try {
    items = await listBriefing({ date, status: "published" });
  } catch {
    errored = true;
  }

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
    <div className="min-h-screen bg-[#f7f8fa] text-[#1a1d24]">
      <header className="border-b border-gray-200 bg-white">
        <div className="mx-auto flex max-w-3xl items-center justify-between px-4 py-3 sm:px-6">
          <div className="flex items-center gap-2">
            <span className="text-lg font-bold tracking-tight">StockTell</span>
            <span className="hidden text-xs text-gray-400 sm:inline">
              我不懂产业链,你告诉我怎么想
            </span>
          </div>
          <nav className="flex items-center gap-4 text-sm text-gray-500">
            <span className="cursor-default font-medium text-gray-900">
              今日简报
            </span>
            <Link href="/stocks" className="hover:text-gray-900">
              股票池
            </Link>
            <Link href="/track" className="hover:text-gray-900">
              战绩
            </Link>
            <AuthStatus />
          </nav>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-4 py-6 sm:px-6">
        <div className="mb-5 flex items-end justify-between">
          <div>
            <h1 className="text-xl font-semibold tracking-tight">今日简报</h1>
            <p className="mt-1 text-xs text-gray-400">
              {shownDate} · AI 产业链动态,跟你的持仓有什么关系
            </p>
          </div>
        </div>

        {stale && (
          <div className="mb-3 rounded-lg border border-amber-200 bg-amber-50 px-4 py-2.5 text-xs leading-relaxed text-amber-800">
            今日简报尚未更新(每个交易日北京时间约 07:00 生成),以下为最近一期 · {shownDate}。
          </div>
        )}

        {items.length === 0 ? (
          <EmptyState errored={errored} />
        ) : (
          <BriefingFeed items={items} loggedIn={loggedIn} />
        )}

        <p className="mt-6 text-center text-xs text-gray-400">
          以上内容为信息整理,不构成投资建议。历史规律不代表未来表现。
        </p>
        <p className="mt-2 text-center text-[11px] text-gray-300">
          存储:{storageBackend() === "postgres" ? "Vercel Postgres" : "本地(未连数据库)"} ·{" "}
          <Link href="/admin/briefing" className="hover:text-gray-500">
            后台
          </Link>
        </p>
      </main>
    </div>
  );
}

function EmptyState({ errored }: { errored: boolean }) {
  return (
    <div className="rounded-xl border border-dashed border-gray-300 bg-white py-14 text-center">
      <div className="text-sm font-medium text-gray-500">
        {errored ? "读取简报出错" : "今天还没有发布简报"}
      </div>
      <div className="mt-1 text-xs text-gray-400">
        去{" "}
        <Link href="/admin/briefing" className="text-blue-600 hover:underline">
          后台
        </Link>{" "}
        生成并发布今日简报
      </div>
    </div>
  );
}
