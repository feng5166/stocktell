import Dashboard from "@/components/Dashboard";

// 保持静态:走 Vercel 边缘缓存,大陆用户 TTFB 最优(首字节快 > 首帧 DOM 小)。
// 单树优化交给客户端:Dashboard 首帧两套靠 CSS 显隐(SSR 安全、不闪),挂载后收成命中的一套。
export default function StocksPage() {
  return <Dashboard />;
}
