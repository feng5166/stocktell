import type { Metadata } from "next";
import Link from "next/link";
import { ChainSentiment } from "@/components/ChainSentiment";
import { ShareLandingTracker } from "@/components/share/ShareCardActions";
import { sentimentSnapshot } from "@/lib/sentiment";
import { DISCLAIMER } from "@/lib/constants";

// 情绪卡承接页(2.3 P0-3):扫码先看价值,再软引导——顶部软 CTA,不弹窗拦截(方案 §6)。
// 极简页头(不挂全站导航):本页会走独立承接域,保持轻;noindex(分享落地不进搜索)。
export const revalidate = 60;

export const metadata: Metadata = {
  title: "AI 链今日情绪 | StockTell",
  description: "AI 产业链今日情绪一瞥:A 股涨跌家数、主力净流入、隔夜美股。信息参考,不构成投资建议。",
  robots: { index: false },
};

export default async function ShareLandingSentiment() {
  const snap = await sentimentSnapshot().catch(() => null);
  return (
    <div className="min-h-screen bg-canvas text-ink">
      <ShareLandingTracker />
      <main className="mx-auto max-w-md px-4 py-6">
        {/* 极简品牌头 */}
        <div className="flex items-center gap-2">
          <span className="h-3 w-3 rounded-full bg-cyan-400" />
          <span className="text-sm font-semibold tracking-widest text-gray-900">STOCKTELL</span>
          <span className="text-xs text-gray-400">我不懂产业链,你告诉我怎么想</span>
        </div>

        {/* 软 CTA(不拦截):先看到价值,再给理由 */}
        <Link
          href="/?utm_source=share&utm_medium=sentiment_card"
          className="mt-4 flex items-center justify-between gap-3 rounded-xl bg-brand-50 px-4 py-3 hover:bg-brand-100"
        >
          <span className="text-xs leading-relaxed text-brand-800">
            这是朋友分享的今日情绪。把你关注的票加进自选,明早直接看「这事传导到你的票了吗」。
          </span>
          <span className="shrink-0 text-xs font-medium text-brand-600">去看看 →</span>
        </Link>

        {/* 情绪只读(复用首页同款组件,过期后台自刷) */}
        <div className="mt-4">
          <ChainSentiment initial={snap?.data} refresh={snap ? !snap.fresh : false} />
        </div>

        <p className="mt-6 text-center text-xs leading-relaxed text-gray-400">{DISCLAIMER}</p>
      </main>
    </div>
  );
}
