import { NextRequest, NextResponse } from "next/server";
import tls from "tls";
import { isCronAuthorized } from "@/lib/api-guard";
import { alertCron } from "@/lib/monitor";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// 证书到期安全网:宝塔默认自动续期 Let's Encrypt;万一续期失败,这里每日检查、
// 剩余 < 14 天就发飞书告警。检查的是微信桥域名(其它都是 Vercel/平台托管证书,自动续)。
// 2026-07-08 负责人拍板:微信桥/Umami 暂不迁移(bridge.stocktell.me 随备案停解析后失效;
// 微信推送 0 绑定用户、cron 碰桥前即 no-weixin-users 早退)。本检查唯一监控对象就是桥证书——
// 对象弃管,监控默认停用,否则停解析当天起每日空报警。桥若将来迁 bridge.maoadao.com 重启用:
// 设 CERT_CHECK_HOST 环境变量即可(同步 CLAWBOT_BASE_URL)。
const HOST = process.env.CERT_CHECK_HOST || "";
const WARN_DAYS = 14;

function daysToExpiry(host: string, port = 443): Promise<number | null> {
  return new Promise((resolve) => {
    const sock = tls.connect(
      { host, port, servername: host, timeout: 8000 },
      () => {
        const cert = sock.getPeerCertificate();
        sock.end();
        if (!cert || !cert.valid_to) return resolve(null);
        const ms = new Date(cert.valid_to).getTime() - Date.now();
        resolve(Math.floor(ms / 86400000));
      }
    );
    sock.on("error", () => resolve(null));
    sock.on("timeout", () => {
      sock.destroy();
      resolve(null);
    });
  });
}

export async function GET(req: NextRequest) {
  if (!isCronAuthorized(req)) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }
  if (!HOST) return NextResponse.json({ ok: true, skipped: "cert-check-disabled(无监控对象)" });
  const days = await daysToExpiry(HOST);
  if (days === null) {
    await alertCron("cert-check", `无法读取 ${HOST} 的 HTTPS 证书(连接失败?可能桥/nginx 异常)`);
    return NextResponse.json({ ok: false, host: HOST, days: null });
  }
  if (days < WARN_DAYS) {
    await alertCron(
      "证书将过期",
      `${HOST} 的 HTTPS 证书还有 ${days} 天到期。宝塔本应自动续期,请去面板检查续期是否正常。`
    );
  }
  return NextResponse.json({ ok: true, host: HOST, days });
}
