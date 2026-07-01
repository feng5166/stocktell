import { headers } from "next/headers";
import Dashboard from "@/components/Dashboard";
import { isMobileUserAgent } from "@/lib/ua";

// 读 UA 让 Dashboard 首帧只渲染命中的一套(移动卡片 / 桌面表格),避免双 DOM。
// 代价:本页转为动态渲染(不再走边缘静态缓存);因本页服务端不打任何 DB/接口,
// 仅多一次纯 CPU 的壳渲染,无 Tushare 压力。移动端第一要务下,单树更小的 HTML 值得。
export const dynamic = "force-dynamic";

export default function StocksPage() {
  const ua = headers().get("user-agent");
  return <Dashboard initialIsMobile={isMobileUserAgent(ua)} />;
}
