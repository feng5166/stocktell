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
  const [copied, setCopied] = useState<"idle" | "done" | "fail">("idle");
  const [shareUrl, setShareUrl] = useState("");
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

  // 我的分享 ref:登录用 userId,游客用 anon(仍归因到"来自分享")
  const myRef = session?.user?.id ?? "anon";
  useEffect(() => {
    if (typeof window === "undefined") return;
    setShareUrl(
      `${window.location.origin}/chain/${chainId}?ref=${encodeURIComponent(myRef)}&utm_source=share`
    );
  }, [chainId, myRef]);

  const openShare = () => {
    setShowShare(true);
    track("share_poster_generated", { chain: chainId, entry: "landing" });
  };

  // 跨浏览器复制:clipboard API 失败(微信/旧 WebView 常禁用)→ execCommand 兜底
  async function robustCopy(text: string): Promise<boolean> {
    try {
      if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(text);
        return true;
      }
    } catch {
      /* 落到兜底 */
    }
    try {
      const ta = document.createElement("textarea");
      ta.value = text;
      ta.style.position = "fixed";
      ta.style.top = "0";
      ta.style.opacity = "0";
      document.body.appendChild(ta);
      ta.focus();
      ta.select();
      ta.setSelectionRange(0, text.length); // iOS 需要
      const ok = document.execCommand("copy");
      document.body.removeChild(ta);
      return ok;
    } catch {
      return false;
    }
  }

  const copyLink = async () => {
    const ok = await robustCopy(shareUrl);
    setCopied(ok ? "done" : "fail");
    setTimeout(() => setCopied("idle"), 2200);
    if (ok) track("share_link_copied", { chain: chainId, medium: "link" });
  };

  // 移动端最优:调起系统/微信原生分享面板;无则回退复制
  const nativeShare = async () => {
    if (typeof navigator !== "undefined" && navigator.share) {
      try {
        await navigator.share({
          title: `${chainName} · 今日解读`,
          text: `${summary.moodLine} · ${summary.overnight}`,
          url: shareUrl,
        });
        track("share_link_copied", { chain: chainId, medium: "native" });
        return;
      } catch (e) {
        // 用户主动取消(AbortError)→ 不兜底;其它失败(部分安卓/国产浏览器 share 抛错)→ 兜底复制
        if (e instanceof Error && e.name === "AbortError") return;
      }
    }
    await copyLink(); // 无原生分享 或 share 真失败 → 复制链接 + 提示,别让按钮变死
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
                onClick={nativeShare}
                className="flex-1 rounded-lg bg-white px-4 py-2.5 text-sm font-semibold text-brand-700 shadow"
              >
                📤 分享给朋友
              </button>
              <button
                onClick={copyLink}
                className="rounded-lg bg-white px-4 py-2.5 text-sm font-medium text-gray-800 shadow"
              >
                {copied === "done" ? "✓ 已复制" : "复制链接"}
              </button>
            </div>
            {copied === "done" && (
              <p className="mt-2 text-center text-xs font-medium text-white">
                ✓ 链接已复制,粘贴到微信发给朋友/群
              </p>
            )}
            {/* 仅复制失败时才露链接兜底(平时不显示) */}
            {copied === "fail" && (
              <input
                readOnly
                value={shareUrl}
                onFocus={(e) => e.currentTarget.select()}
                className="mt-2 w-full rounded-lg bg-white/95 px-3 py-2 text-xs text-gray-600"
                aria-label="分享链接"
              />
            )}
            <p className="mt-2 text-center text-xs text-white/85">
              点「分享」调起微信/系统分享,或复制链接、截屏转发这张卡片
            </p>
            <button
              onClick={() => setShowShare(false)}
              className="mt-1 w-full py-2 text-center text-sm text-white/80"
            >
              关闭
            </button>
          </div>
        </div>
      )}
    </>
  );
}
