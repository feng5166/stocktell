import Link from "next/link";
import type { Metadata } from "next";
import { SiteHeader } from "@/components/SiteHeader";
import { listArchiveDates } from "@/lib/archive-dates";
import { DISCLAIMER } from "@/lib/constants";

// 简报归档索引(2.1-W4):按日列出全部已发布简报日,是 /daily/[date] 的抓取入口。
export const revalidate = 3600;

export const metadata: Metadata = {
  title: "产业链简报归档:按日回看全球事件到 A 股的传导 | StockTell",
  description:
    "StockTell 每个交易日的产业链推理简报归档:隔夜事件、传导环节、A 股映射与当日状态记录。研究框架梳理·非确认,不构成投资建议。",
  alternates: { canonical: "/daily" },
};

export default async function DailyIndexPage() {
  const dates = await listArchiveDates(120).catch(() => [] as string[]);
  return (
    <div className="min-h-screen bg-canvas text-ink">
      <SiteHeader active="今日推理" />
      <main className="mx-auto max-w-3xl px-4 py-6 sm:px-6">
        <header className="mb-4">
          <h1 className="text-h1 font-semibold tracking-tight">简报归档</h1>
          <p className="mt-1 text-xs leading-relaxed text-gray-400">
            每个交易日的产业链推理简报按日沉淀;休市/兜底/阻断等状态也有记录,可解释「那天为什么没有新简报」。
          </p>
        </header>
        {dates.length === 0 ? (
          <div className="rounded-xl border border-dashed border-gray-300 bg-white py-12 text-center text-sm text-gray-500">
            归档积累中
          </div>
        ) : (
          <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {dates.map((d) => (
              <li key={d}>
                <Link
                  href={`/daily/${d}`}
                  className="block rounded-lg bg-white px-3 py-2 text-sm text-gray-700 shadow-sm hover:text-brand-600"
                >
                  {d}
                </Link>
              </li>
            ))}
          </ul>
        )}
        <p className="mt-6 text-center text-xs leading-relaxed text-gray-400">{DISCLAIMER}</p>
      </main>
    </div>
  );
}
