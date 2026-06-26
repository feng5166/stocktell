import Link from "next/link";
import { listBriefing, storageBackend, type BriefingItem } from "@/lib/briefings";

export const dynamic = "force-dynamic";

const FREE_LIMIT = 3;

function todayISO(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

const IMPACT_META: Record<
  BriefingItem["impact"],
  { dot: string; label: string; ring: string }
> = {
  高: { dot: "🔴", label: "高影响", ring: "border-rose-200" },
  中: { dot: "🟡", label: "中影响", ring: "border-amber-200" },
  低: { dot: "🟢", label: "低影响", ring: "border-emerald-200" },
};

export default async function Home() {
  const date = todayISO();
  let items: BriefingItem[] = [];
  let errored = false;
  try {
    items = await listBriefing({ date, status: "published" });
  } catch {
    errored = true;
  }

  // 免费墙:高影响全部可见 + 累计前 3 条可见,其余锁定
  let shown = 0;
  const rows = items.map((it) => {
    const free = it.impact === "高" || shown < FREE_LIMIT;
    if (free) shown++;
    return { it, free };
  });

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
            <button className="rounded-md bg-gray-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-gray-700">
              登录
            </button>
          </nav>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-4 py-6 sm:px-6">
        <div className="mb-5 flex items-end justify-between">
          <div>
            <h1 className="text-xl font-semibold tracking-tight">今日简报</h1>
            <p className="mt-1 text-xs text-gray-400">
              {date} · AI 产业链动态,跟你的持仓有什么关系
            </p>
          </div>
        </div>

        {rows.length === 0 ? (
          <EmptyState errored={errored} />
        ) : (
          <div className="space-y-3">
            {rows.map(({ it, free }) =>
              free ? (
                <BriefingCard key={it.id} item={it} />
              ) : (
                <LockedCard key={it.id} item={it} />
              )
            )}
          </div>
        )}

        <p className="mt-6 text-center text-xs text-gray-400">
          以上内容为信息整理,不构成投资建议。历史规律不代表未来表现。
        </p>
        <p className="mt-2 text-center text-[11px] text-gray-300">
          存储:{storageBackend() === "supabase" ? "Supabase" : "本地(未配置 Supabase)"} ·{" "}
          <Link href="/admin/briefing" className="hover:text-gray-500">
            后台
          </Link>
        </p>
      </main>
    </div>
  );
}

function BriefingCard({ item }: { item: BriefingItem }) {
  const meta = IMPACT_META[item.impact];
  return (
    <article className={`rounded-xl border bg-white p-4 ${meta.ring}`}>
      <div className="mb-1 flex items-center gap-2 text-xs font-medium">
        <span>{meta.dot}</span>
        <span className="text-gray-500">{meta.label}</span>
      </div>
      <h2 className="text-[15px] font-semibold text-gray-900">{item.title}</h2>
      {item.beneficiaries.length > 0 && (
        <div className="mt-2 flex flex-wrap items-center gap-1.5">
          <span className="text-xs text-gray-400">受益 A 股</span>
          {item.beneficiaries.map((b) => (
            <Link
              key={b.code}
              href={`/stock/${b.code}`}
              className="rounded bg-gray-100 px-2 py-0.5 text-xs text-gray-700 hover:bg-gray-200"
            >
              {b.name}
            </Link>
          ))}
        </div>
      )}
      <div className="mt-3 rounded-lg bg-amber-50 px-3 py-2">
        <div className="mb-1 text-xs font-medium text-amber-700">散户怎么想</div>
        <p className="text-sm leading-relaxed text-gray-800">{item.retailTake}</p>
      </div>
    </article>
  );
}

function LockedCard({ item }: { item: BriefingItem }) {
  const meta = IMPACT_META[item.impact];
  return (
    <article className="relative overflow-hidden rounded-xl border border-gray-200 bg-white p-4">
      <div className="pointer-events-none select-none blur-[5px]">
        <div className="mb-1 flex items-center gap-2 text-xs font-medium">
          <span>{meta.dot}</span>
          <span className="text-gray-500">{meta.label}</span>
        </div>
        <h2 className="text-[15px] font-semibold text-gray-900">{item.title}</h2>
        <p className="mt-3 text-sm text-gray-500">
          订阅后查看完整分析与受益标的……
        </p>
      </div>
      <div className="absolute inset-0 flex items-center justify-center">
        <button className="rounded-full bg-gray-900 px-4 py-1.5 text-xs font-medium text-white shadow hover:bg-gray-700">
          🔒 订阅解锁全部简报
        </button>
      </div>
    </article>
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
