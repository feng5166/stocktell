// 路由切换时的加载占位:保留头部(导航不闪),内容区显示"加载中…"+ 骨架块。
// 用于各页 loading.tsx —— App Router 会在目标页服务端渲染期间立即显示它。
import { SiteHeader } from "@/components/SiteHeader";

export function PageSkeleton({
  active,
  wide,
}: {
  active?: string;
  wide?: boolean;
}) {
  return (
    <div className="min-h-screen bg-canvas">
      <SiteHeader active={active} wide={wide} />
      <main
        className={`mx-auto ${wide ? "max-w-7xl" : "max-w-3xl"} px-4 py-6 sm:px-6`}
      >
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
