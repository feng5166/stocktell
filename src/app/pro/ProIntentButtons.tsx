"use client";

// 商业化意向收集(2.2-C):不收费、不承诺,只收信号。点击 → feedback 表按类落一条 +
// Umami 事件(pro_interest / subscribe_intent),admin/metrics 与 Umami 双侧可看。
// 复用 /api/feedback 的既有限流(同 IP 10 分钟 5 条),不新开写端点。
import { useState } from "react";
import { track } from "@/lib/analytics";

export default function ProIntentButtons() {
  const [state, setState] = useState<Record<string, "ok" | "fail" | "busy">>({});

  async function submit(kind: "pro_interest" | "subscribe_intent") {
    const category = kind === "pro_interest" ? "专业版意向" : "订阅意向";
    setState((s) => ({ ...s, [kind]: "busy" }));
    track(kind);
    try {
      const r = await fetch("/api/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ category, content: `${category}(/pro 轻入口)`, path: "/pro" }),
      });
      const d = await r.json().catch(() => ({ ok: false }));
      setState((s) => ({ ...s, [kind]: r.ok && d.ok !== false ? "ok" : "fail" }));
    } catch {
      setState((s) => ({ ...s, [kind]: "fail" }));
    }
  }

  const btn = (kind: "pro_interest" | "subscribe_intent", label: string) => {
    const st = state[kind];
    if (st === "ok")
      return <span className="rounded-lg bg-emerald-50 px-4 py-2 text-sm text-emerald-700">已记录,谢谢!有更新会在站内公告</span>;
    return (
      <button
        onClick={() => submit(kind)}
        disabled={st === "busy"}
        className="rounded-lg bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-700 disabled:opacity-50"
      >
        {st === "busy" ? "提交中…" : label}
      </button>
    );
  };

  return (
    <div className="flex flex-wrap items-center gap-3">
      {btn("pro_interest", "🔔 专业版有更新时提醒我")}
      {btn("subscribe_intent", "📮 我想订阅每日产业链推理")}
      {(state.pro_interest === "fail" || state.subscribe_intent === "fail") && (
        <span className="text-xs text-rose-500">提交失败(可能操作过于频繁),稍后再试</span>
      )}
    </div>
  );
}
