"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useSession, signOut } from "next-auth/react";
import { useRouter } from "next/navigation";
import { useAuthModal } from "@/components/Providers";

// 登录后头像下拉菜单。
// 扩展方式:往 MENU_ITEMS 里加一项即可(label/href/icon),无需改组件逻辑。
type MenuItem = { label: string; href: string; icon: React.ReactNode };

const MENU_ITEMS: MenuItem[] = [
  { label: "个人设置", href: "/settings", icon: <GearIcon /> },
  // 后续扩展示例(直接加进来即可):
  // { label: "我的自选", href: "/stocks?tab=mine", icon: <StarIcon /> },
  // { label: "推送设置", href: "/settings#push", icon: <BellIcon /> },
  // { label: "帮助 / 反馈", href: "/about", icon: <HelpIcon /> },
];

export function AuthStatus() {
  const { data, status } = useSession();
  const { open } = useAuthModal();
  const router = useRouter();
  const [menuOpen, setMenuOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  // 点击外部 / Esc 关闭
  useEffect(() => {
    if (!menuOpen) return;
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setMenuOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMenuOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [menuOpen]);

  if (status !== "authenticated") {
    return (
      <button
        onClick={() => open()}
        className="rounded-md bg-gray-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-gray-700"
      >
        登录
      </button>
    );
  }

  const u = data.user;
  const initial = (u?.email?.[0] || u?.name?.[0] || "?").toUpperCase();
  const title = u?.email || u?.name || "已登录";

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setMenuOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={menuOpen}
        aria-label="账号菜单"
        className="flex items-center rounded-full transition-opacity hover:opacity-80 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-400 focus-visible:ring-offset-1"
      >
        <Avatar image={u?.image} initial={initial} title={title} size={7} />
      </button>

      {menuOpen && (
        <div
          role="menu"
          className="absolute right-0 z-50 mt-2 w-56 overflow-hidden rounded-xl border border-gray-200 bg-white py-1 shadow-lg"
        >
          {/* 账户头部:让用户确认当前账号 */}
          <div className="flex items-center gap-2.5 border-b border-gray-100 px-3 pb-3 pt-2">
            <Avatar image={u?.image} initial={initial} title={title} size={9} />
            <div className="min-w-0">
              <div className="truncate text-sm font-medium text-gray-800">
                {u?.name || "我的账号"}
              </div>
              <div className="truncate text-xs text-gray-400">{u?.email}</div>
            </div>
          </div>

          {/* 菜单项(配置化:改 MENU_ITEMS 即可扩展) */}
          <div className="py-1">
            {MENU_ITEMS.map((it) => (
              <Link
                key={it.href}
                href={it.href}
                role="menuitem"
                onClick={() => setMenuOpen(false)}
                className="flex items-center gap-2.5 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50"
              >
                <span className="text-gray-400">{it.icon}</span>
                {it.label}
              </Link>
            ))}
          </div>

          {/* 退出:与上方分隔,弱化处理 */}
          <div className="border-t border-gray-100 pt-1">
            <button
              role="menuitem"
              onClick={async () => {
                setMenuOpen(false);
                // 退出后停留在当前页并软刷新(重渲染服务端组件为登出态),不再跳回首页
                await signOut({ redirect: false });
                router.refresh();
              }}
              className="flex w-full items-center gap-2.5 px-3 py-2 text-left text-sm text-gray-600 hover:bg-gray-50"
            >
              <span className="text-gray-400">
                <LogoutIcon />
              </span>
              退出登录
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function Avatar({
  image,
  initial,
  title,
  size,
}: {
  image?: string | null;
  initial: string;
  title: string;
  size: 7 | 9;
}) {
  const cls = size === 9 ? "h-9 w-9" : "h-7 w-7";
  if (image) {
    // eslint-disable-next-line @next/next/no-img-element
    return (
      <img src={image} alt={title} className={`${cls} rounded-full object-cover`} />
    );
  }
  return (
    <span
      className={`flex ${cls} shrink-0 items-center justify-center rounded-full bg-gray-900 text-xs font-semibold text-white`}
    >
      {initial}
    </span>
  );
}

function GearIcon() {
  return (
    <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" className="h-4 w-4">
      <circle cx="10" cy="10" r="2.5" />
      <path
        d="M10 2.5v2M10 15.5v2M2.5 10h2M15.5 10h2M4.7 4.7l1.4 1.4M13.9 13.9l1.4 1.4M15.3 4.7l-1.4 1.4M6.1 13.9l-1.4 1.4"
        strokeLinecap="round"
      />
    </svg>
  );
}

function LogoutIcon() {
  return (
    <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" className="h-4 w-4">
      <path d="M8 17H4.5A1.5 1.5 0 013 15.5v-11A1.5 1.5 0 014.5 3H8" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M13 14l4-4-4-4M17 10H8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
