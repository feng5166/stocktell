import type { Metadata, Viewport } from "next";
import Script from "next/script";
import "./globals.css";
import { Providers } from "@/components/Providers";
import { PWARegister } from "@/components/PWARegister";
import { SiteFooter } from "@/components/SiteFooter";
import { GuestWatchlistNudge } from "@/components/GuestWatchlistNudge";
import { AuthTracker } from "@/components/AuthTracker";

// Umami 网页分析(自托管 analytics.stocktell.me)。配了 WEBSITE_ID 才注入,
// 自动采集 pageview;自定义事件经 lib/analytics 的 track() 上报。
const UMAMI_SRC = process.env.NEXT_PUBLIC_UMAMI_SRC;
const UMAMI_ID = process.env.NEXT_PUBLIC_UMAMI_WEBSITE_ID;
// Microsoft Clarity(会话回放 + 热力图,免费、自动屏蔽输入/PII)。配了 ID 才注入。
// 分工:Umami 管漏斗/事件,Clarity 管回放/热力图。NEXT_PUBLIC_ 构建时内联。
const CLARITY_ID = process.env.NEXT_PUBLIC_CLARITY_ID;

export const metadata: Metadata = {
  title: "StockTell · AI产业链股票池",
  description:
    "面向 A 股散户的 AI 金融信息工具:把复杂的 AI 产业链动态,翻译成『这条新闻跟你的持仓有什么关系』。",
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "StockTell",
  },
  icons: {
    icon: [
      { url: "/icon.svg", type: "image/svg+xml" },
      { url: "/icon-192.png" },
    ],
    apple: "/icon-180.png",
  },
};

export const viewport: Viewport = {
  themeColor: "#0f172a",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN">
      <body className="antialiased pb-[calc(3.5rem+env(safe-area-inset-bottom))] sm:pb-0">
        <Providers>
          {children}
          <GuestWatchlistNudge />
          <AuthTracker />
        </Providers>
        <SiteFooter />
        <PWARegister />
        {UMAMI_SRC && UMAMI_ID && (
          <Script src={UMAMI_SRC} data-website-id={UMAMI_ID} strategy="afterInteractive" />
        )}
        {/* lazyOnload:clarity.ms 大陆访问慢,afterInteractive 会在水合后立刻抢加载、浏览器
            转圈久停不下(体感"页面很慢")。改页面完全加载后再拉,回放少记开头几秒无所谓。 */}
        {CLARITY_ID && (
          <Script id="ms-clarity" strategy="lazyOnload">
            {`(function(c,l,a,r,i,t,y){c[a]=c[a]||function(){(c[a].q=c[a].q||[]).push(arguments)};t=l.createElement(r);t.async=1;t.src="https://www.clarity.ms/tag/"+i;y=l.getElementsByTagName(r)[0];y.parentNode.insertBefore(t,y);})(window,document,"clarity","script","${CLARITY_ID}");`}
          </Script>
        )}
      </body>
    </html>
  );
}
