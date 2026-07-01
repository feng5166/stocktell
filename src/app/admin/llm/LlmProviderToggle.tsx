"use client";

import { useState } from "react";

type Provider = "primary" | "fallback";

export function LlmProviderToggle({
  initial,
  hasFallback,
}: {
  initial: Provider;
  hasFallback: boolean;
}) {
  const [provider, setProvider] = useState<Provider>(initial);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");

  async function switchTo(to: Provider) {
    setBusy(true);
    setMsg("");
    try {
      const r = await fetch(`/api/admin/llm-provider?to=${to}`, { method: "POST" });
      const d = await r.json();
      if (d.ok) {
        setProvider(to);
        setMsg("已切换 ✓(≤30s 全实例生效)");
      } else setMsg("切换失败");
    } catch {
      setMsg("切换失败");
    }
    setBusy(false);
  }

  const btn = (active: boolean) =>
    `rounded-lg px-4 py-2 text-sm font-medium ${
      active
        ? "bg-gray-900 text-white"
        : "border border-gray-300 bg-white text-gray-700 hover:border-gray-400 disabled:opacity-40"
    }`;

  return (
    <div className="mt-4 rounded-xl border border-gray-200 bg-white p-4">
      <div className="text-sm text-gray-700">
        当前:
        <b className={provider === "fallback" ? "text-rose-600" : "text-emerald-600"}>
          {provider === "fallback" ? " 兜底 DeepSeek(flash)" : " 主 modelverse"}
        </b>
      </div>
      {!hasFallback && (
        <div className="mt-2 rounded bg-amber-50 px-2 py-1 text-xs text-amber-700">
          未配置兜底环境变量(LLM_FALLBACK_*),切到兜底将无效、自动回退主。
        </div>
      )}
      <div className="mt-3 flex gap-2">
        <button
          disabled={busy || provider === "primary"}
          onClick={() => switchTo("primary")}
          className={btn(provider === "primary")}
        >
          用主(modelverse)
        </button>
        <button
          disabled={busy || provider === "fallback" || !hasFallback}
          onClick={() => switchTo("fallback")}
          className={btn(provider === "fallback")}
        >
          切到兜底(DeepSeek flash)
        </button>
      </div>
      {msg && <div className="mt-2 text-xs text-gray-500">{msg}</div>}
      <p className="mt-3 text-xs text-gray-400">
        主 LLM 延迟劣化时会飞书提醒,你在这里手动切;兜底统一走 deepseek-v4-flash。
        切换存 DB、≤30s 全实例生效,无需重部署。
      </p>
    </div>
  );
}
