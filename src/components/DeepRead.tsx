"use client";

// 通用「让 StockTell 深读这条 →」:点按后向 /api/briefing/explain 流式拉一段解读。
// payload 即请求体(如 {kind:"morning",items} / {kind:"fundflow",items,date} / {id} / {code})。
// 与个股页 StockTellTake 的解读区一致;此处不绑定具体内容,任何模块都能复用。
import { useState } from "react";
import { useSession } from "next-auth/react";
import { useAuthModal } from "@/components/Providers";
import { track } from "@/lib/analytics";

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

export function DeepRead({
  payload,
  label = "🔍 让 StockTell 深读这条 →",
}: {
  payload: Record<string, unknown>;
  label?: string;
}) {
  const [deep, setDeep] = useState("");
  const [loading, setLoading] = useState(false);
  const [started, setStarted] = useState(false);
  const [errored, setErrored] = useState(false);
  const { status } = useSession();
  const { open: openAuth } = useAuthModal();

  async function load() {
    if (status !== "authenticated") {
      openAuth("登录后,StockTell 用大白话帮你拆这条对你手里的票意味着什么 —— 免费,不喊单。");
      return;
    }
    setStarted(true);
    setLoading(true);
    setErrored(false);
    setDeep("");
    track("deep_read", {
      kind: String(payload.kind ?? (payload.id ? "briefing" : payload.code ? "stock" : "?")),
    });
    try {
      const res = await fetch("/api/briefing/explain", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok || !res.body) {
        if (res.status === 401) {
          openAuth("登录后,StockTell 用大白话帮你拆这条对你手里的票意味着什么 —— 免费,不喊单。");
          setStarted(false);
          return;
        }
        setErrored(true);
        setLoading(false);
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
      if (!acc.trim()) setErrored(true); // 流空 = 视为失败,给重试
    } catch {
      setErrored(true);
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      {!started && (
        <div className="mt-2 text-right">
          <button
            onClick={load}
            className="inline-flex items-center gap-1 text-xs font-medium text-gray-500 hover:text-gray-800 hover:underline"
          >
            {label}
          </button>
        </div>
      )}

      {started && (
        <div className="mt-2.5 border-t border-gray-200 pt-2.5">
          <div className="mb-1 flex items-center gap-1 text-xs font-medium text-gray-600">
            <span>🤖</span> StockTell 解读
          </div>
          {loading && !deep && (
            <p className="flex items-center gap-1.5 text-xs text-gray-500">
              <span className="inline-block h-1.5 w-1.5 animate-ping rounded-full bg-gray-400" />
              StockTell 助手正在为你解读,请稍候…
            </p>
          )}
          {errored ? (
            <p className="text-xs text-gray-500">
              解读暂时没出来(服务繁忙)。
              <button
                onClick={load}
                className="ml-1 font-medium text-brand-600 hover:underline"
              >
                🔄 重试
              </button>
            </p>
          ) : (
            deep && (
              <div>
                {renderRich(deep)}
                {loading && <span className="animate-pulse text-gray-400">▍</span>}
                {!loading && (
                  <p className="mt-2 text-[11px] leading-relaxed text-gray-400">
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
