"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { Logo } from "@/components/Logo";

// 后台导航:9 个功能整合为 5 组(单项组直达,多项组下拉)。
// 扩展方式:往 GROUPS 里加 item 即可,无需改组件逻辑。
type NavItem = { href: string; label: string };
type NavGroup = { key: string; label: string; items: NavItem[] };

const GROUPS: NavGroup[] = [
  { key: "users", label: "用户", items: [{ href: "/admin/users", label: "用户" }] },
  {
    key: "push",
    label: "推送",
    items: [
      { href: "/admin/push", label: "微信推送" },
      { href: "/admin/email", label: "邮件推送" },
    ],
  },
  {
    key: "review",
    label: "审发",
    items: [
      { href: "/admin/briefing", label: "简报审发" },
      { href: "/admin/insights", label: "推理审发" },
    ],
  },
  {
    key: "relation",
    label: "关系",
    items: [
      { href: "/admin/relation-review", label: "关系模型" },
      { href: "/admin/resolver-health", label: "关系健康" },
    ],
  },
  {
    key: "system",
    label: "系统",
    items: [
      { href: "/admin/metrics", label: "接口监控" },
      { href: "/admin/llm", label: "模型切换" },
    ],
  },
];

function isActive(path: string, href: string) {
  return path === href || path.startsWith(href + "/");
}

export function AdminNav({ adminEmail }: { adminEmail: string }) {
  const path = usePathname();
  const [openKey, setOpenKey] = useState<string | null>(null);
  const navRef = useRef<HTMLElement>(null);

  // 路由变化后收起下拉
  useEffect(() => {
    setOpenKey(null);
  }, [path]);

  // 点击外部 / Esc 关闭
  useEffect(() => {
    if (!openKey) return;
    const onDoc = (e: MouseEvent) => {
      if (navRef.current && !navRef.current.contains(e.target as Node)) setOpenKey(null);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpenKey(null);
    };
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [openKey]);

  return (
    <header className="border-b border-gray-200 bg-white">
      <div className="mx-auto flex max-w-4xl items-center gap-x-3 px-4 py-3 sm:px-6">
        <Link href="/" aria-label="StockTell 首页" className="shrink-0">
          <Logo className="h-6 w-auto" />
        </Link>
        <span className="shrink-0 text-xs text-gray-400">后台</span>

        <nav ref={navRef} className="flex min-w-0 gap-1">
          {GROUPS.map((g) => {
            const groupActive = g.items.some((it) => isActive(path, it.href));
            // 单项组:直达链接
            if (g.items.length === 1) {
              return (
                <Link
                  key={g.key}
                  href={g.items[0].href}
                  className={`rounded-md px-3 py-1.5 text-sm font-medium ${
                    groupActive ? "bg-gray-900 text-white" : "text-gray-600 hover:bg-gray-100"
                  }`}
                >
                  {g.label}
                </Link>
              );
            }
            // 多项组:下拉
            const open = openKey === g.key;
            const activeItem = g.items.find((it) => isActive(path, it.href));
            return (
              <div key={g.key} className="relative">
                <button
                  type="button"
                  aria-expanded={open}
                  aria-haspopup="menu"
                  onClick={() => setOpenKey(open ? null : g.key)}
                  className={`flex items-center gap-1 rounded-md px-3 py-1.5 text-sm font-medium ${
                    groupActive ? "bg-gray-900 text-white" : "text-gray-600 hover:bg-gray-100"
                  }`}
                >
                  {activeItem ? activeItem.label : g.label}
                  <svg
                    className={`h-3 w-3 transition-transform ${open ? "rotate-180" : ""}`}
                    viewBox="0 0 12 12"
                    fill="none"
                    aria-hidden
                  >
                    <path d="M3 4.5 6 7.5 9 4.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </button>
                {open && (
                  <div
                    role="menu"
                    className="absolute left-0 top-full z-30 mt-1 min-w-[8.5rem] rounded-lg border border-gray-200 bg-white py-1 shadow-lg"
                  >
                    {g.items.map((it) => {
                      const active = isActive(path, it.href);
                      return (
                        <Link
                          key={it.href}
                          role="menuitem"
                          href={it.href}
                          className={`block px-3.5 py-2 text-sm ${
                            active
                              ? "bg-gray-100 font-medium text-gray-900"
                              : "text-gray-600 hover:bg-gray-50 hover:text-gray-900"
                          }`}
                        >
                          {it.label}
                        </Link>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </nav>

        <div className="ml-auto flex shrink-0 items-center gap-3 text-xs text-gray-400">
          <span className="hidden md:inline">{adminEmail}</span>
          <Link href="/" className="whitespace-nowrap text-gray-500 hover:text-gray-900">
            看前台 →
          </Link>
        </div>
      </div>
    </header>
  );
}
