"use client";

// 通用「让 StockTell 拆一下 →」(原深读):点按后向 /api/briefing/explain 流式拉一段解读。
// payload 即请求体(如 {kind:"morning",items} / {kind:"fundflow",items,date} / {id} / {code})。
// 与个股页 StockTellTake 的解读区一致;此处不绑定具体内容,任何模块都能复用。
import { useEffect, useRef, useState } from "react";
import { useSession } from "next-auth/react";
import { useAuthModal } from "@/components/Providers";
import { track } from "@/lib/analytics";
import { StockTellRichText } from "@/components/StockTellRichText";

export function DeepRead({
  payload,
  label = "🔍 让 StockTell 拆一下 →",
  autoStart = false,
}: {
  payload: Record<string, unknown>;
  label?: string;
  autoStart?: boolean; // 挂载即自动开始解读(即时关系卡用);默认仍是点按触发
}) {
  const [deep, setDeep] = useState("");
  const [loading, setLoading] = useState(false);
  const [started, setStarted] = useState(false);
  const [errored, setErrored] = useState(false);
  const { status } = useSession();
  const { open: openAuth } = useAuthModal();

  // 免登录口径(新手路径 v2):id/code 解读游客可看(服务端共享缓存、无投毒面);
  // morning/fundflow 依赖库内自选,仍走登录。
  const needsLogin =
    payload.kind === "morning" || payload.kind === "fundflow";

  async function load() {
    if (needsLogin && status !== "authenticated") {
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
        if (res.status === 404) {
          // 404 带的是给用户看的说明(如"这一期没有相关动态"),照原文展示为终态,
          // 不能落进"服务繁忙+重试"——重试永远不会成功。
          const msg = await res.text().catch(() => "");
          setDeep(msg || "这一期暂时没有可深读的内容。");
          setLoading(false);
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

  // autoStart:挂载后自动拉一次(严格模式双执行/重复渲染由 startedRef 防抖)
  const startedRef = useRef(false);
  useEffect(() => {
    if (!autoStart || startedRef.current || started) return;
    if (needsLogin && status !== "authenticated") return; // 自动模式绝不弹登录框
    startedRef.current = true;
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoStart, status]);

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
                <StockTellRichText text={deep} />
                {loading && <span className="animate-pulse text-gray-400">▍</span>}
                {!loading && (
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
