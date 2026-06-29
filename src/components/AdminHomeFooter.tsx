"use client";

// 首页底部的管理员入口(后台 + 数据看板)。首页改 ISR 后没有服务端 session,
// 故客户端按需问一下 /api/me/is-admin,是管理员才渲染。非管理员什么都不显示。
import Link from "next/link";
import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";

export function AdminHomeFooter() {
  const { status } = useSession();
  const [isAdmin, setIsAdmin] = useState(false);

  useEffect(() => {
    if (status !== "authenticated") return;
    let active = true;
    fetch("/api/me/is-admin", { cache: "no-store" })
      .then((r) => r.json())
      .then((d) => active && setIsAdmin(!!d.isAdmin))
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [status]);

  if (!isAdmin) return null;
  return (
    <p className="mt-2 text-center text-meta text-gray-300">
      <Link href="/admin/briefing" className="hover:text-gray-500">
        后台
      </Link>{" "}
      ·{" "}
      <a
        href="https://analytics.stocktell.me"
        target="_blank"
        rel="noreferrer"
        className="hover:text-gray-500"
      >
        数据看板
      </a>
    </p>
  );
}
