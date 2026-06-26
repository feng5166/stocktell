"use client";

import { useSession, signOut } from "next-auth/react";
import { useAuthModal } from "@/components/Providers";

export function AuthStatus() {
  const { data, status } = useSession();
  const { open } = useAuthModal();

  if (status === "authenticated") {
    return (
      <span className="flex items-center gap-2 text-xs text-gray-500">
        <span className="hidden max-w-[120px] truncate sm:inline">
          {data.user?.email}
        </span>
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
