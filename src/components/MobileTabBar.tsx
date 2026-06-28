"use client";

// 移动端底部主导航:把原本挤在顶栏一行的几个入口下放到拇指可达的底栏。
// 仅手机显示(sm:hidden),桌面仍用 SiteHeader 顶部 nav,布局不变。
// 借鉴 cyberfate 的 TabBar:fixed 底栏 + 图标/文字 + safe-area-inset。
// 仅布局/结构,不引入图标库(内联 SVG)、不改视觉 token,配色用中性灰。
import Link from "next/link";
import { usePathname } from "next/navigation";

type Tab = { label: string; href: string; icon: (active: boolean) => React.ReactNode };

const sw = (a: boolean) => (a ? 2.4 : 1.8);

const TABS: Tab[] = [
  {
    label: "简报",
    href: "/",
    icon: (a) => (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={sw(a)} className="h-5 w-5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M4 4h16v16H4z" />
        <path d="M8 9h8M8 13h8M8 17h5" />
      </svg>
    ),
  },
  {
    label: "股票池",
    href: "/stocks",
    icon: (a) => (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={sw(a)} className="h-5 w-5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M4 18l5-6 4 4 7-9" />
        <path d="M4 4v16h16" />
      </svg>
    ),
  },
  {
    label: "战绩",
    href: "/track",
    icon: (a) => (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={sw(a)} className="h-5 w-5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M6 20V10M12 20V4M18 20v-7" />
      </svg>
    ),
  },
  {
    label: "关于",
    href: "/about",
    icon: (a) => (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={sw(a)} className="h-5 w-5" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="9" />
        <path d="M12 11v5M12 8h.01" />
      </svg>
    ),
  },
];

export function MobileTabBar() {
  const pathname = usePathname();
  const isActive = (href: string) =>
    href === "/" ? pathname === "/" : pathname.startsWith(href);

  return (
    <nav
      className="fixed bottom-0 left-0 right-0 z-40 border-t border-gray-200 bg-white/95 backdrop-blur-md sm:hidden"
      style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
      aria-label="主导航"
    >
      <div className="flex h-14 items-stretch justify-around">
        {TABS.map((t) => {
          const active = isActive(t.href);
          return (
            <Link
              key={t.href}
              href={t.href}
              aria-current={active ? "page" : undefined}
              className={`flex min-w-[64px] flex-col items-center justify-center gap-0.5 transition-transform active:scale-95 ${
                active ? "text-gray-900" : "text-gray-400"
              }`}
            >
              {t.icon(active)}
              <span className={`text-meta ${active ? "font-medium" : "font-normal"}`}>
                {t.label}
              </span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
