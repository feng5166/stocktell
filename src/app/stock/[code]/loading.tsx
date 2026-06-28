import Link from "next/link";

// 详情页骨架(头部与详情页一致:StockTell + 返回股票池),避免用到根 loading 的错误头部。
export default function Loading() {
  return (
    <div className="min-h-screen bg-canvas">
      <header className="border-b border-gray-200 bg-white">
        <div className="mx-auto flex max-w-3xl items-center justify-between px-4 py-3 sm:px-6">
          <Link href="/" className="text-lg font-bold tracking-tight">
            StockTell
          </Link>
          <Link
            href="/stocks"
            className="text-sm text-gray-500 hover:text-gray-900"
          >
            ← 返回股票池
          </Link>
        </div>
      </header>
      <main className="mx-auto max-w-3xl px-4 py-6 sm:px-6">
        <div className="mb-4 flex items-center gap-2 text-sm text-gray-400">
          <span className="h-4 w-4 animate-spin rounded-full border-2 border-gray-300 border-t-gray-500" />
          加载中…
        </div>
        <div className="space-y-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <div
              key={i}
              className="h-24 animate-pulse rounded-xl bg-gray-200/70"
            />
          ))}
        </div>
      </main>
    </div>
  );
}
