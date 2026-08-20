import type { Metadata } from "next";
import Link from "next/link";
import { SiteHeader } from "@/components/SiteHeader";
import { ShareCardTracker, CopyShareText } from "@/components/share/ShareCardActions";
import { sentimentSnapshot } from "@/lib/sentiment";
import { getOrCreateShareLink } from "@/lib/share-link";
import { todayISO } from "@/lib/date";
import { DISCLAIMER } from "@/lib/constants";

// 情绪卡生成页(2.3 P0-3):海报图 + 保存提示 + 只读转发文案。
// 微信内无 JS-SDK 自动分享闭环(方案 §8.2)——统一「长按保存图片 + 复制文案」降级。
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "生成今日情绪卡 | StockTell",
  robots: { index: false }, // 工具页不进搜索
};

export default async function ShareSentimentPage() {
  const snap = await sentimentSnapshot().catch(() => null);
  const date = snap?.data.date ?? todayISO();
  const link = await getOrCreateShareLink("sentiment", date, "/land/sentiment").catch(() => null);
  const avg = snap?.data.a?.avgPct ?? null;
  const mood =
    avg == null ? "" : avg >= 0.2 ? "偏暖" : avg > -0.2 ? "平静" : "偏冷";
  // 只读转发文案(固定模板+免责,方案 §4 硬规则;不含涨跌数字与操作词)
  const copyText =
    `AI 链今日情绪 · ${date}${mood ? ` · ${mood}` : ""}\n` +
    `隔夜美股怎么走、今天传导到 A 股哪条链,扫码/点链接看完整拆解:\n` +
    `${link?.url ?? "https://stocktell.me"}\n` +
    `(信息参考,不构成投资建议。市场有风险。)`;

  return (
    <div className="site-atmosphere min-h-screen text-ink">
      <SiteHeader />
      <ShareCardTracker cardType="sentiment" />
      <main className="mx-auto max-w-md px-4 py-6">
        <h1 className="text-h1 font-semibold tracking-tight">今日情绪卡</h1>
        <p className="mt-1 text-xs text-gray-400">
          长按图片保存,发到朋友圈/群;或复制下方文案直接转发。
        </p>
        {/* 海报(服务端渲染 PNG;alt 提供可访问性回退) */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/api/share/sentiment-card"
          alt={`AI链今日情绪卡 · ${date}`}
          className="mt-4 w-full rounded-2xl shadow-md"
        />
        <div className="mt-4">
          <CopyShareText text={copyText} />
        </div>
        <p className="mt-4 text-center text-xs text-gray-400">
          <Link href="/" className="text-brand-600 hover:underline">
            ← 回今日推理
          </Link>
        </p>
        <p className="mt-4 text-center text-xs leading-relaxed text-gray-400">{DISCLAIMER}</p>
      </main>
    </div>
  );
}
