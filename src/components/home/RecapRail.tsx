// 底部右栏「值得复看」(首页阅读路径改版 2026-08-14,server component)。
// 负责人方案 A:下半页保持双栏 dashboard,不允许右侧大面积空白——
// 右栏=最近事件专篇 + 意图快照历史 + 每日归档,全是既有入口的聚合,零新数据。
import Link from "next/link";

export interface RecapDoc {
  slug: string;
  date: string;
  title: string;
}

export function RecapRail({ docs }: { docs: RecapDoc[] }) {
  return (
    <aside className="mt-8 lg:mt-0">
      <h2 className="text-lg font-semibold text-gray-900">值得复看</h2>
      <p className="mt-1 text-meta text-gray-400">最近的完整传导拆解与历史档案</p>
      {/* 信息条:轻边框白条,不做 shadow(右栏是入口聚合,不和左栏内容卡抢层级) */}
      <div className="mt-3 space-y-2">
        {docs.map((d) => (
          <Link
            key={d.slug}
            href={`/insight/evt/${d.slug}`}
            className="block rounded-lg border border-gray-200/60 bg-white px-4 py-3 transition-colors hover:bg-gray-50"
          >
            <span className="block truncate text-sm font-medium text-gray-800">{d.title}</span>
            <span className="mt-0.5 block text-meta text-gray-400">{d.date} · 事件专篇</span>
          </Link>
        ))}
        <Link
          href="/track"
          className="block rounded-lg border border-gray-200/60 bg-white px-4 py-3 text-sm font-medium text-gray-800 transition-colors hover:bg-gray-50"
        >
          板块意图快照历史 →
        </Link>
        <Link
          href="/daily"
          className="block rounded-lg border border-gray-200/60 bg-white px-4 py-3 text-sm font-medium text-gray-800 transition-colors hover:bg-gray-50"
        >
          每日简报归档 →
        </Link>
      </div>
    </aside>
  );
}
