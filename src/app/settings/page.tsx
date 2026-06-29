import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { SiteHeader } from "@/components/SiteHeader";
import { MobileTabBar } from "@/components/MobileTabBar";
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
      </main>
      <MobileTabBar />
    </div>
  );
}
