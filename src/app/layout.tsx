import type { Metadata, Viewport } from "next";
import "./globals.css";
import { Providers } from "@/components/Providers";
import { PWARegister } from "@/components/PWARegister";

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
    icon: "/icon-192.png",
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
      <body className="antialiased">
        <Providers>{children}</Providers>
        <PWARegister />
      </body>
    </html>
  );
}
