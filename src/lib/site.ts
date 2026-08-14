// 站点常量(三轮 review 清理:https://www.stocktell.me 曾在 9 处硬编码)。
// 页面 canonical 走 metadataBase 相对化;绝对 URL(sitemap/robots/JSON-LD)统一从这里取。
// 2026-08-14 切回主域:stocktell.me 备案 07-30 落地后,此处硬编码的临时平台域一直没跟上
// ——sitemap/robots/canonical 全在向搜索引擎宣告 vercel.app 是正主,这就是「搜索索引
// 只见 7 月旧页」的根因(SEO 旧索引污染,负责人 08-14 立项)。切域名三件套:
// 本文件 + Vercel env NEXTAUTH_URL + next.config 的旧域 308(防双主机重复收录)。
export const SITE_URL = "https://www.stocktell.me";

// JSON-LD 安全序列化(三轮 review T1:JSON.stringify 不转义 '<',LLM 生成内容含
// '</script><script>…' 可从 dangerouslySetInnerHTML 的 ld+json 块逃逸执行=存储型 XSS)。
// 所有 JSON-LD 注入必须走这里,不得裸用 JSON.stringify。
export function safeJsonLd(o: object): string {
  return JSON.stringify(o).replace(/</g, "\\u003c");
}
