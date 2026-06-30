"use client";

// 触屏可用的「ⓘ 说明」:点一下弹出释义,点外面关闭。
// 替代只在桌面 hover 才显示的 title——手机用户 100% 看不到 title,这是移动端硬伤。
// 命中区 ≥36px(-m-2 不撑乱布局),点击阻止冒泡以免触发外层行/链接跳转。
import { useEffect, useRef, useState } from "react";

export function InfoHint({ text, className = "" }: { text: string; className?: string }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("click", onDoc);
    return () => document.removeEventListener("click", onDoc);
  }, [open]);

  return (
    <span ref={ref} className={`relative inline-flex align-middle ${className}`}>
      <button
        type="button"
        aria-label="说明"
        onClick={(e) => {
          e.stopPropagation();
          e.preventDefault();
          setOpen((v) => !v);
        }}
        className="-m-2 inline-flex h-9 w-9 items-center justify-center text-gray-400 active:text-gray-600"
      >
        <span className="text-xs leading-none">ⓘ</span>
      </button>
      {open && (
        <span className="absolute left-0 top-7 z-40 w-56 max-w-[72vw] whitespace-normal rounded-lg bg-gray-900 px-3 py-2 text-left text-xs font-normal leading-relaxed text-white shadow-lg">
          {text}
        </span>
      )}
    </span>
  );
}
