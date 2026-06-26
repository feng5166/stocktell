import type { Metadata } from "next";
import "./globals.css";
import { Providers } from "@/components/Providers";

export const metadata: Metadata = {
  title: "StockTell · AI产业链股票池",
  description:
    "面向 A 股散户的 AI 金融信息工具:把复杂的 AI 产业链动态,翻译成『这条新闻跟你的持仓有什么关系』。",
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
      </body>
    </html>
  );
}
