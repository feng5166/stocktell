// 服务端 User-Agent 粗判是否移动设备,用于首帧只渲染命中的一套 UI(客户端再用 matchMedia 兜正)。
// 保守取向:iPad 现代 Safari 常报桌面 UA,判为桌面(大屏走表格)即可,不追求 100% 精确。
export function isMobileUserAgent(ua: string | null | undefined): boolean {
  if (!ua) return false;
  return /Android|webOS|iPhone|iPod|BlackBerry|IEMobile|Opera Mini|Mobile|Windows Phone/i.test(
    ua
  );
}
