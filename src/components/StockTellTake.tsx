"use client";

// 共享:「散户怎么想」正文 + 「StockTell 解读」按需流式深度解读。
// 首页简报卡、个股页都用它(传 itemId 才显示解读按钮;itemId=对应简报条目 id)。
import { useState } from "react";
import { useSession } from "next-auth/react";
import { useAuthModal } from "@/components/Providers";

// 行内加粗:**xxx** → <strong>
function inlineBold(s: string, kp: string) {
  return s.split(/(\*\*[^*]+\*\*)/g).map((seg, i) =>
    /^\*\*[^*]+\*\*$/.test(seg) ? (
      <strong key={kp + i} className="font-semibold text-gray-900">
        {seg.slice(2, -2)}
      </strong>
    ) : (
      <span key={kp + i}>{seg}</span>
    )
  );
}

// 轻量 Markdown 渲染(解读流式文本):加粗、小标题、列表;忽略 --- 分隔线
function renderRich(text: string): JSX.Element[] {
  const blocks: JSX.Element[] = [];
  text.split("\n").forEach((raw, i) => {
    const line = raw.trim();
    if (!line) return;
    if (/^(-{3,}|\*{3,}|_{3,})$/.test(line)) return;
    const heading = /^#{1,6}\s/.test(line) || /^\*\*[^*]+\*\*[::]?$/.test(line);
    let content = line.replace(/^#{1,6}\s*/, "");
    const isList = /^[-*]\s+/.test(content);
    if (isList) content = content.replace(/^[-*]\s+/, "");
    if (heading) {
      const t = content.replace(/^\*\*/, "").replace(/\*\*[::]?$/, "");
      blocks.push(
        <p key={i} className="mt-3 text-sm font-semibold text-gray-900 first:mt-0">
          {t}
        </p>
      );
    } else if (isList) {
      blocks.push(
        <p key={i} className="ml-1 mt-1 text-sm leading-relaxed text-gray-700">
          • {inlineBold(content, i + "-")}
        </p>
      );
    } else {
      blocks.push(
        <p key={i} className="mt-1.5 text-sm leading-relaxed text-gray-700">
          {inlineBold(content, i + "-")}
        </p>
      );
    }
  });
  return blocks;
}

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
        {inlineBold(retailTake, "rt-")}
      </p>

      {canDeep && !deepStarted && (
        <div className="mt-2">
          <button
            onClick={loadDeep}
            className="inline-flex min-h-[40px] items-center gap-1 rounded-lg bg-gray-100 px-3.5 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-200 active:bg-gray-200"
          >
            🔍 让 StockTell 深读这条
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
                {renderRich(deep)}
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
