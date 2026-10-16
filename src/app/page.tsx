import type { Metadata } from "next";
import Link from "next/link";
import { APP_HOME } from "@/lib/site";

// 备案首页(2026-10-16):ICP 备案要求首页标签标题与备案网站名称「个人工具网」一致。
// 产品首页挪到 APP_HOME(/home),这里只留一个不醒目的入口。过审后的改回步骤见 lib/site.ts。
export const metadata: Metadata = {
  title: { absolute: "个人工具网" },
  description: "个人工具网:个人整理的小工具与学习笔记。",
  openGraph: { siteName: "个人工具网", title: "个人工具网" },
  twitter: { title: "个人工具网" },
  appleWebApp: { title: "个人工具网" },
};

export default function FilingHome() {
  return (
    <main className="mx-auto flex min-h-[60vh] max-w-xl flex-col justify-center px-6 py-16">
      <h1 className="text-h1 font-semibold tracking-tight text-gray-900">个人工具网</h1>
      <p className="mt-4 text-sm leading-relaxed text-gray-600">
        这里是一个个人网站,用来存放日常整理的小工具和学习笔记,仅供个人学习交流使用。
      </p>
      <p className="mt-16 text-meta text-gray-400">
        <Link href={APP_HOME} className="hover:text-gray-600">
          产业链笔记
        </Link>
      </p>
    </main>
  );
}
