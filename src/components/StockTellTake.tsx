"use client";

// 共享:「这条逻辑怎么验证」正文 + 「StockTell 解读」按需流式拆解(原深读)。
// 首页简报卡、个股页都用它(传 itemId 才显示解读按钮;itemId=对应简报条目 id)。
import { useState } from "react";
import { useSession } from "next-auth/react";
import { useAuthModal } from "@/components/Providers";
import { InlineStockText, StockTellRichText } from "@/components/StockTellRichText";

export function StockTellTake({
  itemId,
  code,
  retailTake,
}: {
  itemId?: string | null;
  code?: string | null; // 无对应简报时,按个股本身深读
  retailTake: string;
}) {
  const canDeep = !!(itemId || code);
  const [deep, setDeep] = useState("");
  const [deepLoading, setDeepLoading] = useState(false);
  const [deepStarted, setDeepStarted] = useState(false);
  const [deepErrored, setDeepErrored] = useState(false);
  const { status } = useSession();
  const { open: openAuth } = useAuthModal();

  async function loadDeep() {
    if (!canDeep) return;
    if (status !== "authenticated") {
      openAuth("登录后,StockTell 用大白话帮你拆这条对你手里的票意味着什么 —— 免费,不喊单。");
      return;
    }
    setDeepStarted(true);
    setDeepLoading(true);
    setDeepErrored(false);
    setDeep("");
    try {
      const res = await fetch("/api/briefing/explain", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(itemId ? { id: itemId } : { code }),
      });
      if (!res.ok || !res.body) {
        if (res.status === 401) {
          openAuth("登录后,StockTell 用大白话帮你拆这条对你手里的票意味着什么 —— 免费,不喊单。");
          setDeepStarted(false);
          return;
        }
        setDeepErrored(true);
        setDeepLoading(false);
        return;
      }
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let acc = "";
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        const t = decoder.decode(value, { stream: true });
        acc += t;
        setDeep((prev) => prev + t);
      }
      if (!acc.trim()) setDeepErrored(true);
    } catch {
      setDeepErrored(true);
    } finally {
      setDeepLoading(false);
    }
  }

  return (
    <>
      <p className="text-sm leading-relaxed text-gray-800">
        <InlineStockText text={retailTake} />
      </p>

      {canDeep && !deepStarted && (
        <div className="mt-2 text-right">
          <button
            onClick={loadDeep}
            className="inline-flex items-center gap-1 text-xs font-medium text-gray-500 hover:text-gray-800 hover:underline"
          >
            🔍 拆开这条事件 →
          </button>
        </div>
      )}

      {deepStarted && (
        <div className="mt-2.5 border-t border-gray-200 pt-2.5">
          <div className="mb-1 flex items-center gap-1 text-xs font-medium text-gray-600">
            <span>🤖</span> StockTell 解读
          </div>
          {deepLoading && !deep && (
            <p className="flex items-center gap-1.5 text-xs text-gray-500">
              <span className="inline-block h-1.5 w-1.5 animate-ping rounded-full bg-gray-400" />
              StockTell 助手正在为你解读这条信息,请稍候…
            </p>
          )}
          {deepErrored ? (
            <p className="text-xs text-gray-500">
              解读暂时没出来(服务繁忙)。
              <button
                onClick={loadDeep}
                className="ml-1 font-medium text-brand-600 hover:underline"
              >
                🔄 重试
              </button>
            </p>
          ) : (
            deep && (
              <div>
                <StockTellRichText text={deep} />
                {deepLoading && <span className="animate-pulse text-gray-400">▍</span>}
                {!deepLoading && (
                  <p className="mt-2 text-[11px] leading-relaxed text-gray-500">
                    以上为 AI 对公开信息的整理与解读,不构成投资建议。
                  </p>
                )}
              </div>
            )
          )}
        </div>
      )}
    </>
  );
}
