"use client";

// 可点徽章:点一下弹出依据/合规说明(替代手机看不到的 title),点外面关闭。
// 命中即弹,阻止冒泡+默认(放在 <Link> 内点徽章也不会触发跳转)。
// 弹层按锚点位置左/右对齐,避免靠右徽章弹出时溢出屏幕。
import { useEffect, useRef, useState } from "react";

export function TapBadge({
  label,
  cls,
  detail,
}: {
  label: string;
  cls: string;
  detail: string;
}) {
  const [open, setOpen] = useState(false);
  const [alignRight, setAlignRight] = useState(false);
  const ref = useRef<HTMLSpanElement>(null);
  const btnRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("click", onDoc);
    return () => document.removeEventListener("click", onDoc);
  }, [open]);

  return (
    <span ref={ref} className="relative inline-flex">
      <button
        ref={btnRef}
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          e.preventDefault();
          const r = btnRef.current?.getBoundingClientRect();
          if (r) setAlignRight(r.left > window.innerWidth * 0.55);
          setOpen((v) => !v);
        }}
        className={`shrink-0 rounded px-1.5 py-0.5 text-[11px] leading-none ${cls}`}
      >
        {label}
      </button>
      {open && (
        <span
          className={`absolute top-6 z-40 w-52 max-w-[72vw] whitespace-normal rounded-lg bg-gray-900 px-3 py-2 text-left text-xs font-normal leading-relaxed text-white shadow-lg ${
            alignRight ? "right-0" : "left-0"
          }`}
        >
          {detail}
        </span>
      )}
    </span>
  );
}
