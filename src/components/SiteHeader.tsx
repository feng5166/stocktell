// 共用站点头部:首页/股票池/战绩三个主页面统一用它,避免各自内联 header 漂移
// (登录态、导航项、StockTell 链接以前就因为各写一份而对不齐)。
// active 传当前页 label 高亮;wide 用于股票池的宽布局。详情页/后台 header 结构不同,各自保留。
import Link from "next/link";
import { AuthStatus } from "@/components/auth/AuthStatus";
import { Logo } from "@/components/Logo";
import { MobileTabBar } from "@/components/MobileTabBar";

const NAV = [
  { href: "/", label: "今日简报" },
  { href: "/stocks", label: "股票池" },
  { href: "/track", label: "战绩" },
  { href: "/about", label: "关于我们" },
];

export function SiteHeader({
  active,
  wide,
}: {
  active?: string;
  wide?: boolean;
}) {
  return (
    <>
      <header className="border-b border-gray-200 bg-white">
        <div
          className={`mx-auto flex ${
            wide ? "max-w-7xl" : "max-w-3xl"
          } items-center justify-between px-4 py-3 sm:px-6`}
        >
          <div className="flex flex-col gap-0.5">
            <Link href="/" aria-label="StockTell 首页">
              <Logo className="h-7 w-auto" />
            </Link>
            <span className="pl-0.5 text-[11px] leading-none text-gray-400">
              我不懂产业链,你告诉我怎么想
            </span>
          </div>
          <nav className="flex items-center gap-4 text-sm text-gray-500">
            {/* 页面入口在手机端收起,改由底部 TabBar 承载;桌面端保持原样 */}
            <div className="hidden items-center gap-4 sm:flex">
              {NAV.map((n) =>
                n.label === active ? (
                  <span
                    key={n.href}
                    className="cursor-default font-medium text-gray-900"
                  >
                    {n.label}
                  </span>
                ) : (
                  <Link key={n.href} href={n.href} className="hover:text-gray-900">
                    {n.label}
                  </Link>
                )
              )}
            </div>
            <AuthStatus />
          </nav>
        </div>
      </header>

      {/* 移动端底部主导航(仅 sm 以下显示) */}
      <MobileTabBar />
    </>
  );
}
