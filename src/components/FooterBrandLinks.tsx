"use client";

import { usePathname } from "next/navigation";

// 备案期间根路径 / 是「个人工具网」备案首页:页脚的 StockTell 导航与免责只在其他页面出现,
// 备案首页只留备案号。过审后连同 src/app/page.tsx 一起去掉这层判断(见 lib/site.ts)。
export function FooterBrandLinks({ children }: { children: React.ReactNode }) {
  return usePathname() === "/" ? null : <>{children}</>;
}
