import type { Metadata } from "next";
import { SiteHeader } from "@/components/SiteHeader";
import { buildWatchChainMap } from "@/lib/watch-relation";
import { deriveDailySignals } from "@/lib/daily-signals";
import { resolvePrimary } from "@/lib/relation-resolver";
import { SIGNAL_RANK } from "@/lib/signal-rank";
import { todayISO } from "@/lib/date";
import { STOCKS } from "@/data/stocks";
import { ETFS } from "@/data/etfs";
import { DISCLAIMER } from "@/lib/constants";
import WatchlistBoard from "./WatchlistBoard";

// Watchlist 产业链状态页(2.1-W5,2026-07-07 拍板):从「我的自选股」升级成「我的产业链状态」。
// 回答:我的自选今天是否被事件触发?在哪条链?direct/indirect/sentiment?验证点是什么?
// 未覆盖的票显示待验证【不消失】,并给「提交复核」入口(进 relationReviewQueue,source=manual)。
//
// 结构:服务端算全局数据(链身份 map=resolver 唯一入口 + 今日信号=简报真源派生),
// 客户端拿自选 codes 本地组装(登录走 API、游客走 localStorage,与全站 useWatchlist 同构)。
// 全局数据非个性化 → ISR 300s;个性化组装零服务端成本。
export const revalidate = 300;

export const metadata: Metadata = {
  title: "我的自选 · 产业链状态:今日触发与验证点 | StockTell",
  description:
    "自选股按产业链分组:今日是否被事件触发、直接/间接/情绪映射、该看什么验证点。研究框架梳理·非确认,不构成投资建议。",
  alternates: { canonical: "/watchlist" },
};

export default async function WatchlistPage() {
  const date = todayISO();
  const chainMap = buildWatchChainMap();
  // 今日信号(层②真源):按 code 取最强档给客户端(板级展示不需要逐链信号;
  // 不变量#3:信号只做"今日触发"标记,relationType 仍来自 chainMap=staticRelations)
  const signals = await deriveDailySignals(date).catch(() => []);
  const signalMap: Record<string, { strength: string; note: string }> = {};
  for (const s of signals) {
    const prev = signalMap[s.code];
    if (!prev || SIGNAL_RANK[s.signalStrength] > SIGNAL_RANK[prev.strength as keyof typeof SIGNAL_RANK]) {
      signalMap[s.code] = { strength: s.signalStrength, note: s.note ?? "" };
    }
  }
  // code → 名称/市场(客户端渲染用;精简 Record 不拖整个 STOCKS 进包)。
  // ETF 也在(三轮 review T5):自选与个股共用一套 ★,ETF 不进关系模型但不能渲染成裸代码+死流程。
  const names: Record<string, { name: string; market: string }> = {};
  for (const s of STOCKS) names[s.code] = { name: s.name, market: s.market };
  for (const e of ETFS) names[e.code] = { name: e.name, market: "ETF" };
  // 美股触发源链身份(三轮 review T4):trigger 档不在 watchChainMap(那是 A 股三档卡),
  // 但自选里的美股要能亮"今日触发"并正确标注——它有核定档,不是"待验证"。
  const triggerMap: Record<string, { chainName: string }> = {};
  for (const s of STOCKS) {
    if (s.market !== "美股") continue;
    const p = resolvePrimary(s.code);
    if (p?.relationType === "trigger") triggerMap[s.code] = { chainName: p.chainName };
  }

  return (
    <div className="min-h-screen bg-canvas text-ink">
      <SiteHeader active="自选" />
      <main className="mx-auto max-w-3xl px-4 py-6 sm:px-6">
        <header className="mb-4">
          <h1 className="text-h1 font-semibold tracking-tight">我的自选 · 产业链状态</h1>
          <p className="mt-1 text-xs leading-relaxed text-gray-400">
            自选股按产业链分组:今天谁被事件触发、是直接映射还是情绪映射、该看什么验证点。
            关系标注为研究框架梳理·非确认。
          </p>
        </header>
        <WatchlistBoard
          chainMap={chainMap}
          triggerMap={triggerMap}
          signalMap={signalMap}
          names={names}
          date={date}
        />
        <p className="mt-8 text-center text-xs leading-relaxed text-gray-400">{DISCLAIMER}</p>
      </main>
    </div>
  );
}
