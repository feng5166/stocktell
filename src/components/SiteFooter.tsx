import Link from "next/link";

// 全局页脚:给所有用户(不止管理员)一个稳定的法务/关于入口 + 常驻免责。
// 挂在根布局,SiteHeader 覆盖的页面底部都有。文字用 gray-500 保证对比度可读(AA)。
export function SiteFooter() {
  return (
    <footer className="mx-auto max-w-5xl px-4 pb-8 pt-6 text-center">
      <nav className="flex flex-wrap items-center justify-center gap-x-4 gap-y-1 text-meta text-gray-500">
        <Link href="/about" className="hover:text-gray-700">
          关于我们
        </Link>
        <span aria-hidden className="text-gray-300">
          ·
        </span>
        <Link href="/privacy" className="hover:text-gray-700">
          隐私政策
        </Link>
        <span aria-hidden className="text-gray-300">
          ·
        </span>
        <Link href="/terms" className="hover:text-gray-700">
          服务条款
        </Link>
      </nav>
      <p className="mt-2 text-meta leading-relaxed text-gray-500">
        StockTell 的内容均为 AI 对公开信息的整理与解读,不构成投资建议。
      </p>
    </footer>
  );
}
