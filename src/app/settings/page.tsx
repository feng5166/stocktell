import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { SiteHeader } from "@/components/SiteHeader";
import { MobileTabBar } from "@/components/MobileTabBar";
import { FeedbackLink } from "@/components/FeedbackLink";
import { SettingsClient } from "./SettingsClient";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "个人设置 · StockTell",
};

export default async function SettingsPage() {
  const session = await getServerSession(authOptions);

  return (
    <div className="min-h-screen bg-canvas text-ink">
      <SiteHeader />
      <main className="mx-auto max-w-xl px-4 py-6 sm:px-6">
        <h1 className="mb-1 text-h1 font-semibold tracking-tight">个人设置</h1>
        <p className="mb-5 text-sm text-gray-500">管理你的推送渠道</p>

        {session?.user ? (
          <SettingsClient email={session.user.email ?? null} />
        ) : (
          <div className="rounded-2xl border border-gray-200 bg-white p-8 text-center">
            <p className="text-sm text-gray-600">
              请先登录后管理推送设置(点右上角「登录」)。
            </p>
          </div>
        )}

        {/* 意见反馈入口 */}
        <div className="mt-6 flex items-center justify-between gap-3 rounded-2xl border border-gray-200 bg-white p-4">
          <div>
            <div className="text-sm font-medium text-gray-900">意见反馈</div>
            <div className="mt-0.5 text-xs text-gray-400">
              用着哪里不顺、想要什么功能、或想吐个槽,直接告诉我们
            </div>
          </div>
          <FeedbackLink className="shrink-0 whitespace-nowrap rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700" />
        </div>
      </main>
      <MobileTabBar />
    </div>
  );
}
