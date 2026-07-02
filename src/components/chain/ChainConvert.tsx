"use client";

// 分享落地页的转化 + 分享出口:①订阅每日解读(复用 /api/me/digest-pref)②分享(品牌卡 + 复制链接,带 ref)。
// 落地即埋 chain_landing_view(带 ref 归因)。V1 海报先走"品牌卡 + 截图/复制链接";一键存图海报(next/og)后置。
import { useEffect, useRef, useState } from "react";
import { useSession, signIn } from "next-auth/react";
import { track } from "@/lib/analytics";
import { Logo } from "@/components/Logo";

export interface ShareSummary {
  date: string;
  moodLine: string; // "A股 涨32 跌18 · 均 +0.8%"
  overnight: string; // "隔夜 纳指 +1.2% · 费半 +2.5%"
  topTitle: string | null; // 今日头条动态标题
}

export function ChainConvert({
  chainId,
  chainName,
  tagline,
  refCode,
  summary,
}: {
  chainId: string;
  chainName: string;
  tagline: string;
  refCode: string | null;
  summary: ShareSummary;
}) {
  const { data: session } = useSession();
  const [sub, setSub] = useState<"idle" | "loading" | "done">("idle");
  const [showShare, setShowShare] = useState(false);
  const [copied, setCopied] = useState(false);
  const tracked = useRef(false);

  // 落地归因(每次访问一次)
  useEffect(() => {
    if (tracked.current) return;
    tracked.current = true;
    track("chain_landing_view", { chain: chainId, ref: refCode ?? "" });
  }, [chainId, refCode]);

  const subscribe = async () => {
    if (!session?.user) {
      track("chain_subscribe", { chain: chainId, state: "guest" });
      signIn(); // 游客 → 登录/注册,登录后默认在每日推送里
      return;
    }
    setSub("loading");
    try {
      const r = await fetch("/api/me/digest-pref", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled: true }),
      });
      const d = await r.json();
      if (d.ok) {
        setSub("done");
        track("chain_subscribe", { chain: chainId, state: "done" });
      } else setSub("idle");
    } catch {
      setSub("idle");
    }
  };

  // 我的分享 ref:登录用 userId,游客用 anon(仍可归因到"来自分享")
  const myRef = session?.user?.id ?? "anon";
  const shareUrl =
    typeof window !== "undefined"
      ? `${window.location.origin}/chain/${chainId}?ref=${encodeURIComponent(myRef)}&utm_source=share`
      : "";

  const openShare = () => {
    setShowShare(true);
    track("share_poster_generated", { chain: chainId, entry: "landing" });
  };
  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
      track("share_link_copied", { chain: chainId, medium: "link" });
    } catch {
      /* 剪贴板不可用时用户可长按卡片截图 */
    }
  };

  return (
    <>
      <section className="mt-6 rounded-2xl border border-brand-100 bg-brand-50/60 p-4">
        <div className="text-title font-semibold text-gray-900">每天早上,{chainName}怎么动一眼看懂</div>
        <p className="mt-1 text-xs text-gray-500">
          订阅后每个交易日早盘前收到解读邮件(隔夜联动 + 你自选的票要注意)。随时可退订。
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          <button
            onClick={subscribe}
            disabled={sub === "loading" || sub === "done"}
            className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-60"
          >
            {sub === "done"
              ? "✓ 已订阅每日解读"
              : sub === "loading"
              ? "订阅中…"
              : session?.user
              ? "订阅每日解读"
              : "登录并订阅"}
          </button>
          <button
            onClick={openShare}
            className="rounded-lg bg-white px-4 py-2 text-sm font-medium text-brand-700 ring-1 ring-inset ring-brand-200 hover:bg-brand-50"
          >
            分享今日解读
          </button>
        </div>
      </section>

      {showShare && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 p-4"
          onClick={() => setShowShare(false)}
        >
          <div
            className="w-full max-w-sm"
            onClick={(e) => e.stopPropagation()}
          >
            {/* 品牌分享卡(截图转发 / 复制链接) */}
            <div className="overflow-hidden rounded-2xl bg-white shadow-2xl">
              <div className="bg-gradient-to-br from-brand-600 to-indigo-500 px-5 pb-6 pt-5 text-white">
                <div className="flex items-center gap-2">
                  <Logo className="h-5 w-auto brightness-0 invert" />
                  <span className="text-xs opacity-90">StockTell</span>
                </div>
                <div className="mt-4 text-lg font-semibold">{chainName} · 今日解读</div>
                <div className="mt-0.5 text-xs opacity-80">{summary.date}</div>
              </div>
              <div className="space-y-2 px-5 py-4 text-sm text-gray-700">
                <div>📊 {summary.moodLine}</div>
                <div>🌙 {summary.overnight}</div>
                {summary.topTitle && <div className="line-clamp-2">📌 {summary.topTitle}</div>}
                <div className="pt-1 text-xs text-gray-400">{tagline}</div>
              </div>
              <div className="border-t border-gray-100 px-5 py-2.5 text-center text-[11px] text-gray-400">
                stocktell.me/chain/{chainId} · 信息整理,不构成投资建议
              </div>
            </div>

            <div className="mt-3 flex gap-2">
              <button
                onClick={copyLink}
                className="flex-1 rounded-lg bg-white px-4 py-2.5 text-sm font-medium text-gray-800 shadow"
              >
                {copied ? "✓ 链接已复制" : "复制分享链接"}
              </button>
              <button
                onClick={() => setShowShare(false)}
                className="rounded-lg bg-white/10 px-4 py-2.5 text-sm font-medium text-white ring-1 ring-inset ring-white/30"
              >
                关闭
              </button>
            </div>
            <p className="mt-2 text-center text-xs text-white/80">
              长按上面卡片可保存图片,或复制链接发给朋友/群
            </p>
          </div>
        </div>
      )}
    </>
  );
}
