// 博查 Web Search 封装(给"为什么动"提供真实新闻检索)。
// 没配 BOCHA_API_KEY 则返回 null —— 调用方据此降级,绝不编造。
// 文档:https://open.bochaai.com  端点:POST /v1/web-search
const BOCHA_ENDPOINT = "https://api.bochaai.com/v1/web-search";

export interface BochaHit {
  name: string; // 网页标题
  url: string;
  snippet: string;
  summary?: string; // 较长摘要(summary=true 时返回)
  siteName?: string;
  datePublished?: string; // YYYY-MM-DD
}

export function bochaEnabled(): boolean {
  return Boolean(process.env.BOCHA_API_KEY);
}

// freshness: noLimit | oneDay | oneWeek | oneMonth | oneYear | "YYYY-MM-DD..YYYY-MM-DD"
export async function bochaSearch(
  query: string,
  opts: { count?: number; freshness?: string } = {}
): Promise<BochaHit[] | null> {
  const key = process.env.BOCHA_API_KEY;
  if (!key) return null;
  try {
    const resp = await fetch(BOCHA_ENDPOINT, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        query,
        freshness: opts.freshness ?? "oneWeek",
        summary: true,
        count: opts.count ?? 8,
      }),
      cache: "no-store",
    });
    if (!resp.ok) {
      // 别再静默:401=key 无效/错产品、402=余额不足、429=限流,写日志方便线上排查
      console.warn(`[bocha] web-search HTTP ${resp.status}`, (await resp.text()).slice(0, 200));
      return null;
    }
    const j = await resp.json();
    // 兼容返回结构:data.webPages.value 为主
    /* eslint-disable @typescript-eslint/no-explicit-any */
    const list: any[] =
      j?.data?.webPages?.value ?? j?.webPages?.value ?? j?.data?.value ?? [];
    /* eslint-enable @typescript-eslint/no-explicit-any */
    if (!Array.isArray(list) || list.length === 0) return null;
    const hits = list
      .map((h) => ({
        name: String(h?.name ?? ""),
        url: String(h?.url ?? ""),
        snippet: String(h?.snippet ?? ""),
        summary: h?.summary ? String(h.summary) : undefined,
        siteName: h?.siteName ? String(h.siteName) : undefined,
        datePublished: h?.datePublished
          ? String(h.datePublished).slice(0, 10)
          : h?.dateLastCrawled
          ? String(h.dateLastCrawled).slice(0, 10)
          : undefined,
      }))
      .filter((h) => h.name && (h.snippet || h.summary));
    return hits.length ? hits : null;
  } catch (e) {
    console.warn("[bocha] web-search error", String(e));
    return null;
  }
}
