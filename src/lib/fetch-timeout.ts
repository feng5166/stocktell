// 带超时 + 读完 body 的外部抓取:计时器/abort 覆盖 fetch + body 读全程,"头快体卡"也能被打断。
// 给外部 fetch(Yahoo/Tushare/博查/飞书 等)复用,避免机房 IP 偶发卡死挂到平台上限(已踩 /api/quotes 71s)。
// 行情(quotes.ts)有自己的 GBK 版同款实现,这里不重复包它。
const DEFAULT_MS = 6000;

export async function fetchJsonWithTimeout<T = unknown>(
  url: string,
  opts: RequestInit = {},
  ms = DEFAULT_MS
): Promise<T> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), ms);
  try {
    const resp = await fetch(url, { ...opts, signal: ctrl.signal });
    if (!resp.ok) throw new Error(`http ${resp.status}`);
    return (await resp.json()) as T; // 在同一计时器/abort 下读体
  } catch (e) {
    if ((e as { name?: string })?.name === "AbortError")
      console.warn(`[fetch] 超时 ${ms}ms abort: ${url.slice(0, 80)}`);
    throw e;
  } finally {
    clearTimeout(t);
  }
}

export async function fetchTextWithTimeout(
  url: string,
  opts: RequestInit = {},
  ms = DEFAULT_MS,
  encoding = "utf-8"
): Promise<string> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), ms);
  try {
    const resp = await fetch(url, { ...opts, signal: ctrl.signal });
    if (!resp.ok) throw new Error(`http ${resp.status}`);
    const buf = await resp.arrayBuffer();
    return new TextDecoder(encoding).decode(buf);
  } catch (e) {
    if ((e as { name?: string })?.name === "AbortError")
      console.warn(`[fetch] 超时 ${ms}ms abort: ${url.slice(0, 80)}`);
    throw e;
  } finally {
    clearTimeout(t);
  }
}
