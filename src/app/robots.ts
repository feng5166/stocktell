import type { MetadataRoute } from "next";

// SEO 基建(2.1-W4):放开内容页抓取,管理/接口/个人页不进索引。
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: ["/admin", "/api/", "/settings", "/reset-password"],
      },
    ],
    sitemap: "https://www.stocktell.me/sitemap.xml",
  };
}
