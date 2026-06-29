"use client";

import Link from "next/link";
import { useSession, signOut } from "next-auth/react";
import { useAuthModal } from "@/components/Providers";

export function AuthStatus() {
  const { data, status } = useSession();
  const { open } = useAuthModal();

  if (status === "authenticated") {
    const u = data.user;
    // 默认头像:邮箱(或昵称)第一个字母,大写
    const initial = (u?.email?.[0] || u?.name?.[0] || "?").toUpperCase();
    const title = u?.email || u?.name || "已登录";
    return (
      <span className="flex items-center gap-2 text-xs text-gray-500">
        <Link
          href="/settings"
          title="个人设置"
          aria-label="个人设置"
          className="hover:opacity-80"
        >
          {u?.image ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={u.image}
              alt={title}
              className="h-7 w-7 rounded-full object-cover"
            />
          ) : (
            <span className="flex h-7 w-7 items-center justify-center rounded-full bg-gray-900 text-xs font-semibold text-white">
              {initial}
            </span>
          )}
        </Link>
        <Link
          href="/settings"
          className="rounded-md border border-gray-300 px-2.5 py-1 hover:bg-gray-100"
        >
          设置
        </Link>
        <button
          onClick={() => signOut()}
          className="rounded-md border border-gray-300 px-2.5 py-1 hover:bg-gray-100"
        >
          退出
        </button>
      </span>
    );
  }
  return (
    <button
      onClick={open}
      className="rounded-md bg-gray-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-gray-700"
    >
      登录
    </button>
  );
}
