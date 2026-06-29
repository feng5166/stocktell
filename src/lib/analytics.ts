// 埋点封装:统一走 Umami。未加载/被拦截都不报错(失败静默,绝不影响主流程)。
// 事件清单与漏斗口径见 docs/埋点需求.md。属性只传非身份信息(code/kind/method 等),不传 PII。
type Props = Record<string, string | number | boolean>;

export function track(event: string, props?: Props): void {
  if (typeof window === "undefined") return;
  try {
    const u = (window as unknown as { umami?: { track?: (e: string, p?: Props) => void } }).umami;
    u?.track?.(event, props);
  } catch {
    /* 忽略 */
  }
}
