"use client";

// 分享落地页的转化 + 分享出口:①订阅每日解读(复用 /api/me/digest-pref)②分享海报图(内嵌二维码)。
// 海报图:客户端把卡片渲成 PNG(浏览器自带中文字体,绕开 next/og 的 CJK 字体坑)→ 支持则系统分享
// 图片文件、不支持(华为/微信 webview)则渲成真 <img> 让用户长按保存/转发。图里二维码 → 扫码回带 ref
// 的落地页,分享闭环不断。落地即埋 chain_landing_view(带 ref 归因)。
import { useEffect, useRef, useState } from "react";
import { useSession, signIn } from "next-auth/react";
import { track } from "@/lib/analytics";

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
  const [qrUrl, setQrUrl] = useState("");
  const [imgState, setImgState] = useState<"idle" | "working" | "saved" | "fail">("idle");
  const [imgUrl, setImgUrl] = useState("");
  const posterRef = useRef<HTMLDivElement | null>(null);
  const tracked = useRef(false);

  // 落地归因(每次访问一次)
  useEffect(() => {
    if (tracked.current) return;
    tracked.current = true;
    track("chain_landing_view", { chain: chainId, ref: refCode ?? "" });
  }, [chainId, refCode]);

  const myRef = session?.user?.id ?? "anon";
  useEffect(() => {
    if (typeof window === "undefined") return;
    setShareUrl(
      `${window.location.origin}/chain/${chainId}?ref=${encodeURIComponent(myRef)}&utm_source=share`
    );
  }, [chainId, myRef]);

  // 生成二维码(指向带 ref 的落地页)
  useEffect(() => {
    if (!shareUrl) return;
    import("qrcode")
      .then((QR) => QR.toDataURL(shareUrl, { margin: 1, width: 200 }))
      .then(setQrUrl)
      .catch(() => {});
  }, [shareUrl]);

  const subscribe = async () => {
    if (!session?.user) {
      track("chain_subscribe", { chain: chainId, state: "guest" });
      signIn();
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

  const openShare = () => {
    setShowShare(true);
    setImgState("idle");
    setImgUrl("");
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
      ta.setSelectionRange(0, text.length);
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

  // 分享海报图:DOM → PNG → 支持则系统分享图片文件;不支持则渲成 <img> 让用户长按保存/转发
  const shareImage = async () => {
    if (!posterRef.current) return;
    setImgState("working");
    try {
      const { toBlob } = await import("html-to-image");
      const blob = await toBlob(posterRef.current, {
        pixelRatio: 2,
        cacheBust: true,
        backgroundColor: "#ffffff",
      });
      if (!blob) throw new Error("no-blob");
      const file = new File([blob], "stocktell-ai-chain.png", { type: "image/png" });
      const nav = navigator as Navigator & {
        canShare?: (d: { files: File[] }) => boolean;
      };
      if (nav.canShare && nav.canShare({ files: [file] })) {
        try {
          await navigator.share({ files: [file] });
          track("share_image", { chain: chainId, medium: "native" });
          setImgState("idle");
          return;
        } catch (e) {
          if (e instanceof Error && e.name === "AbortError") {
            setImgState("idle");
            return;
          }
          /* 其它失败 → 落到长按保存兜底 */
        }
      }
      // 兜底:渲成真 <img>,用户长按保存/转发(华为内置/微信 webview 也能用)
      setImgUrl(URL.createObjectURL(blob));
      setImgState("saved");
      track("share_image", { chain: chainId, medium: "longpress" });
    } catch {
      setImgState("fail");
    }
  };

  return (
    <>
      <section className="mt-6 rounded-2xl border border-brand-100 bg-brand-50/60 p-4">
        <div className="text-title font-semibold text-gray-900">
          每天早上,{chainName}怎么动一眼看懂
        </div>
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
          className="fixed inset-0 z-[100] flex items-center justify-center overflow-y-auto bg-black/50 p-4"
          onClick={() => setShowShare(false)}
        >
          <div className="w-full max-w-sm py-6" onClick={(e) => e.stopPropagation()}>
            {/* 兜底:已生成的图片(真 <img>,可长按保存/转发) */}
            {imgState === "saved" && imgUrl ? (
              <>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={imgUrl}
                  alt="今日解读海报"
                  className="w-full rounded-2xl shadow-2xl"
                />
                <p className="mt-3 text-center text-sm text-white">
                  长按上面图片「保存图片 / 发送给朋友」
                </p>
              </>
            ) : (
              // 海报卡(既是预览,也是渲图目标)
              <div
                ref={posterRef}
                className="overflow-hidden rounded-2xl bg-white shadow-2xl"
              >
                <div className="bg-brand-600 px-5 pb-5 pt-5 text-white">
                  <div className="text-xs font-semibold tracking-wide opacity-90">
                    StockTell · 产业链解读
                  </div>
                  <div className="mt-3 text-xl font-bold">{chainName} · 今日解读</div>
                  <div className="mt-0.5 text-xs opacity-80">{summary.date}</div>
                </div>
                <div className="space-y-2.5 px-5 py-4 text-sm text-gray-700">
                  <div>📊 {summary.moodLine}</div>
                  <div>🌙 {summary.overnight}</div>
                  {summary.topTitle && (
                    <div className="line-clamp-2">📌 {summary.topTitle}</div>
                  )}
                </div>
                <div className="flex items-center gap-3 border-t border-gray-100 px-5 py-4">
                  {qrUrl && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={qrUrl} alt="扫码" className="h-16 w-16 rounded" />
                  )}
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-medium text-gray-800">
                      扫码看今日解读 · 加自选
                    </div>
                    <div className="mt-0.5 text-xs text-gray-400">{tagline}</div>
                  </div>
                </div>
                <div className="bg-gray-50 px-5 py-2 text-center text-[11px] text-gray-400">
                  信息整理,不构成投资建议 · stocktell.me
                </div>
              </div>
            )}

            <div className="mt-3 flex gap-2">
              {imgState !== "saved" && (
                <button
                  onClick={shareImage}
                  disabled={imgState === "working"}
                  className="flex-1 rounded-lg bg-white px-4 py-2.5 text-sm font-semibold text-brand-700 shadow disabled:opacity-60"
                >
                  {imgState === "working" ? "生成图片中…" : "📤 分享图片"}
                </button>
              )}
              <button
                onClick={copyLink}
                className={`rounded-lg bg-white px-4 py-2.5 text-sm font-medium text-gray-800 shadow ${
                  imgState === "saved" ? "flex-1" : ""
                }`}
              >
                {copied === "done" ? "✓ 已复制" : "复制链接"}
              </button>
            </div>
            {copied === "done" && (
              <p className="mt-2 text-center text-xs font-medium text-white">
                ✓ 链接已复制,粘贴到微信发给朋友/群
              </p>
            )}
            {imgState === "fail" && (
              <p className="mt-2 text-center text-xs text-white/85">
                图片生成失败,可改用「复制链接」或直接截屏转发
              </p>
            )}
            <p className="mt-2 text-center text-xs text-white/85">
              分享图片里带二维码,朋友扫码即可看解读、加自选
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
