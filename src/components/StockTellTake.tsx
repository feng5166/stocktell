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
  retailTake,
}: {
  itemId?: string | null;
  retailTake: string;
}) {
  const [deep, setDeep] = useState("");
  const [deepLoading, setDeepLoading] = useState(false);
  const [deepStarted, setDeepStarted] = useState(false);
  const { status } = useSession();
  const { open: openAuth } = useAuthModal();

  async function loadDeep() {
    if (!itemId) return;
    if (status !== "authenticated") {
      openAuth();
      return;
    }
    setDeepStarted(true);
    setDeepLoading(true);
    setDeep("");
    try {
      const res = await fetch("/api/briefing/explain", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: itemId }),
      });
      if (!res.ok || !res.body) {
        if (res.status === 401) {
          openAuth();
          setDeepStarted(false);
          return;
        }
        setDeep("解读暂时不可用,稍后再试。");
        setDeepLoading(false);
        return;
      }
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        setDeep((prev) => prev + decoder.decode(value, { stream: true }));
      }
    } catch {
      setDeep("解读出错了,稍后再点一次试试。");
    } finally {
      setDeepLoading(false);
    }
  }

  return (
    <>
      <p className="text-sm leading-relaxed text-gray-800">
        {inlineBold(retailTake, "rt-")}
      </p>

      {itemId && !deepStarted && (
        <div className="mt-2 text-right">
          <button
            onClick={loadDeep}
            className="inline-flex items-center gap-1 text-xs font-medium text-gray-500 hover:text-gray-800 hover:underline"
          >
            🔍 让 StockTell 深读这条 →
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
          {deep && (
            <div>
              {renderRich(deep)}
              {deepLoading && <span className="animate-pulse text-gray-400">▍</span>}
            </div>
          )}
        </div>
      )}
    </>
  );
}
