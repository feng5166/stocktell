"use client";

// 当本站以「已安装 App」(standalone / iOS 主屏)模式打开时,在头部显示一个"已安装"小标识。
// 普通浏览器标签页里不显示。
import { useEffect, useState } from "react";

export function InstalledBadge() {
  const [installed, setInstalled] = useState(false);

  useEffect(() => {
    const mql = window.matchMedia("(display-mode: standalone)");
    const check = () =>
      setInstalled(
        mql.matches ||
          (navigator as unknown as { standalone?: boolean }).standalone === true
      );
    check();
    mql.addEventListener?.("change", check);
    return () => mql.removeEventListener?.("change", check);
  }, []);

  if (!installed) return null;
  return (
    <span
      title="已作为 App 安装,从主屏图标打开"
      className="inline-flex shrink-0 items-center rounded-full bg-emerald-50 px-1.5 py-0.5 text-[10px] font-medium text-emerald-600"
    >
      ✓ 已安装
    </span>
  );
}
