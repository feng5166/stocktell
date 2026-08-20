import type { Metadata, Viewport } from "next";
import Script from "next/script";
import "./globals.css";
import { Providers } from "@/components/Providers";
import { PWARegister } from "@/components/PWARegister";
import { SiteFooter } from "@/components/SiteFooter";
import { GuestWatchlistNudge } from "@/components/GuestWatchlistNudge";
import { AuthTracker } from "@/components/AuthTracker";
import { FunnelTracker } from "@/components/FunnelTracker";
import { AhaPushNudge } from "@/components/AhaPushNudge";
import { SITE_URL, safeJsonLd } from "@/lib/site";

// Umami 网页分析(自托管 analytics.stocktell.me)。配了 WEBSITE_ID 才注入,
// 自动采集 pageview;自定义事件经 lib/analytics 的 track() 上报。
const UMAMI_SRC = process.env.NEXT_PUBLIC_UMAMI_SRC;
const UMAMI_ID = process.env.NEXT_PUBLIC_UMAMI_WEBSITE_ID;

// WebSite JSON-LD(2.1-W4 SEO 基建):站点级结构化数据,页面级 Article 由 insight 归档页自带
const WEBSITE_JSONLD = {
  "@context": "https://schema.org",
  "@type": "WebSite",
  name: "StockTell",
  url: SITE_URL,
  description:
    "把全球事件拆解为产业链传导、A 股映射、关系强弱和可核实依据的产业理解工具。不构成投资建议。",
  inLanguage: "zh-CN",
};

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: "StockTell｜今日产业链推理:把全球事件翻译成 A 股产业链映射",
  description:
    "StockTell 不是新闻聚合,也不提供买卖建议。我们把全球事件拆解为产业链传导、A 股映射、关系强弱和可核实依据,帮助用户理解今天哪些产业链值得关注。",
  // SEO 底座(2026-07-09):全局 OG/Twitter 兜底;分享图走 /opengraph-image(动态生成)
  openGraph: {
    siteName: "StockTell",
    type: "website",
    locale: "zh_CN",
    title: "StockTell｜今日产业链推理",
    description: "把全球事件翻译成产业链传导与 A 股映射:关系分级、验证点、历史复盘。不构成投资建议。",
  },
  twitter: { card: "summary_large_image", title: "StockTell｜今日产业链推理" },
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
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: safeJsonLd(WEBSITE_JSONLD) }}
        />
        <Providers>
          {children}
          <GuestWatchlistNudge />
          <AhaPushNudge />
          <AuthTracker />
          <FunnelTracker />
        </Providers>
        <SiteFooter />
        <PWARegister />
        {UMAMI_SRC && UMAMI_ID && (
          <Script src={UMAMI_SRC} data-website-id={UMAMI_ID} strategy="afterInteractive" />
        )}
      </body>
    </html>
  );
}
