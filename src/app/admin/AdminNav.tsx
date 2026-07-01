"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Logo } from "@/components/Logo";

const TABS = [
  { href: "/admin/users", label: "用户" },
  { href: "/admin/push", label: "微信推送" },
  { href: "/admin/email", label: "邮件推送" },
  { href: "/admin/briefing", label: "简报审发" },
  { href: "/admin/metrics", label: "接口监控" },
  { href: "/admin/llm", label: "模型切换" },
];

export function AdminNav({ adminEmail }: { adminEmail: string }) {
  const path = usePathname();
  return (
    <header className="border-b border-gray-200 bg-white">
      <div className="mx-auto flex max-w-4xl flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3 sm:px-6">
        <Link href="/" aria-label="StockTell 首页">
          <Logo className="h-6 w-auto" />
        </Link>
        <span className="text-xs text-gray-400">后台</span>
        <nav className="flex gap-1">
          {TABS.map((t) => {
            const active = path === t.href || path.startsWith(t.href + "/");
            return (
              <Link
                key={t.href}
                href={t.href}
                className={`rounded-md px-3 py-1.5 text-sm font-medium ${
                  active
                    ? "bg-gray-900 text-white"
                    : "text-gray-600 hover:bg-gray-100"
                }`}
              >
                {t.label}
              </Link>
            );
          })}
        </nav>
        <div className="ml-auto flex items-center gap-3 text-xs text-gray-400">
          <span className="hidden sm:inline">{adminEmail}</span>
          <Link href="/" className="text-gray-500 hover:text-gray-900">
            看前台 →
          </Link>
        </div>
      </div>
    </header>
  );
}
