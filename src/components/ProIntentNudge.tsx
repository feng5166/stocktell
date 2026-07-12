"use client";
// Pro 意向轻入口(PRD prd-trust-chat-pro-intent §6.3,PR5)。
// 触发纪律:完成一次证据展开(EvidencePanel open)或一次追问回答后才显示——
// 不打断首屏、登录和对话过程(对话面板开着时不弹)。localStorage 30 天展示抑制
// (只抑制展示,不作真实去重);点走 /pro?from=nudge,pro_intent_view 带 trigger。
import { useEffect, useState } from "react";
import { track } from "@/lib/analytics";

const LS_UNTIL = "stocktell_pro_nudge_until";
const SUPPRESS_MS = 30 * 24 * 3600 * 1000;
export const DEEP_EVT = "stocktell:deep-engaged";

export function ProIntentNudge() {
  const [show, setShow] = useState(false);
  const [trigger, setTrigger] = useState("");

  useEffect(() => {
    try {
      const until = Number(localStorage.getItem(LS_UNTIL) ?? 0);
      if (until > Date.now()) return; // 30 天抑制期内不监听
    } catch {
      /* ignore */
    }
    const on = (e: Event) => {
      const t = (e as CustomEvent<{ trigger?: string }>).detail?.trigger ?? "evidence";
      // 对话进行中不弹(chat 触发的等回答完由面板侧派发,evidence 触发时若面板开着也让位)
      setTrigger(t);
      setShow(true);
      track("pro_intent_view", { entry: "nudge", trigger: t });
      window.removeEventListener(DEEP_EVT, on);
    };
    window.addEventListener(DEEP_EVT, on);
    return () => window.removeEventListener(DEEP_EVT, on);
  }, []);

  const dismiss = () => {
    setShow(false);
    try {
      localStorage.setItem(LS_UNTIL, String(Date.now() + SUPPRESS_MS));
    } catch {
      /* ignore */
    }
  };

  if (!show) return null;
  return (
    <div className="fixed bottom-4 left-4 z-40 max-w-[16rem] rounded-xl bg-white p-3 shadow-lg ring-1 ring-gray-100">
      <p className="text-xs leading-relaxed text-gray-600">
        在认真核实依据?我们在规划更深的追踪能力——30 秒告诉我们你要什么(免费,不绑卡)。
      </p>
      <div className="mt-2 flex items-center gap-2">
        <a
          href={`/pro?from=nudge_${trigger}`}
          className="rounded-lg bg-gray-900 px-2.5 py-1.5 text-xs font-medium text-white hover:bg-gray-700"
        >
          去登记需求
        </a>
        <button onClick={dismiss} className="text-xs text-gray-400 hover:text-gray-600">
          不用了
        </button>
      </div>
    </div>
  );
}
