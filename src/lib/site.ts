// 站点常量(三轮 review 清理:https://www.stocktell.me 曾在 9 处硬编码)。
// 页面 canonical 走 metadataBase 相对化;绝对 URL(sitemap/robots/JSON-LD)统一从这里取。
// 2026-07-08 域名切换:stocktell.me 送 ICP 备案(备案期间解析停止),站点主域迁 maoadao.com。
export const SITE_URL = "https://www.maoadao.com";

// JSON-LD 安全序列化(三轮 review T1:JSON.stringify 不转义 '<',LLM 生成内容含
// '</script><script>…' 可从 dangerouslySetInnerHTML 的 ld+json 块逃逸执行=存储型 XSS)。
// 所有 JSON-LD 注入必须走这里,不得裸用 JSON.stringify。
export function safeJsonLd(o: object): string {
  return JSON.stringify(o).replace(/</g, "\\u003c");
}
