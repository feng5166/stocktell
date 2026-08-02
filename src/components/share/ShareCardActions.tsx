"use client";
// 情绪卡分享页的客户端动作(2.3 P0-3):
// - share_card_generate 埋点(到达分享页=完成一次生成,方案 §7 薄漏斗第一环)
// - 只读转发文案复制(方案硬规则 §4:只给可复制文本、不给可编辑框,末尾带免责)
import { useEffect, useRef, useState } from "react";
import { track } from "@/lib/analytics";

export function ShareCardTracker({ cardType }: { cardType: string }) {
  const done = useRef(false);
  useEffect(() => {
    if (done.current) return;
    done.current = true;
    track("share_card_generate", { card_type: cardType });
  }, [cardType]);
  return null;
}

export function CopyShareText({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="rounded-xl bg-gray-50 p-3">
      {/* 只读文案:不提供编辑入口,工程不拼接用户自填文字(方案 §8.8) */}
      <p className="whitespace-pre-wrap text-xs leading-relaxed text-gray-600">{text}</p>
      <button
        onClick={async () => {
          try {
            await navigator.clipboard.writeText(text);
            setCopied(true);
            track("share_card_copy_text", { card_type: "sentiment" });
            setTimeout(() => setCopied(false), 2000);
          } catch {
            /* 剪贴板不可用(http/权限)静默 */
          }
        }}
        className="mt-2 inline-flex min-h-[36px] items-center rounded-lg bg-white px-3 py-1.5 text-xs font-medium text-gray-700 shadow-sm hover:bg-gray-100"
      >
        {copied ? "已复制 ✓" : "复制转发文案"}
      </button>
    </div>
  );
}

export function ShareLandingTracker() {
  const done = useRef(false);
  useEffect(() => {
    if (done.current) return;
    done.current = true;
    const sp = new URLSearchParams(window.location.search);
    track("share_link_visit", {
      sc: sp.get("sc") ?? "",
      card_type: sp.get("card") ?? "",
    });
  }, []);
  return null;
}
