import { NextRequest, NextResponse } from "next/server";
import { SITE_URL } from "@/lib/site";
import { isCronAuthorized } from "@/lib/api-guard";

export const dynamic = "force-dynamic";
export const maxDuration = 60; // init-db 事务超时 30s,留余量

// 部署后 schema 收敛(2026-07-12,自愈>runbook>人肉):deploy-initdb 工作流在新部署接管
// 流量后调本端点,幂等重跑 init-db——把「改库忘跑 init-db」从哨兵告警(事后)提前到
// 部署即收敛(事前),schema 哨兵窗口归零。
// 鉴权分层:GH 侧只持 CRON_SECRET(已有 secret,零新增);init-db 仍只认 ADMIN_TOKEN,
// 由本端点在服务端用自己的 env 自调——ADMIN_TOKEN 不出现在 GH。
// self-fetch 固定走 SITE_URL 平台域(briefing-backup 同教训:不依赖自有域名解析)。
export async function GET(req: NextRequest) {
  if (!isCronAuthorized(req)) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }
  const adminToken = process.env.ADMIN_TOKEN;
  if (!adminToken) {
    return NextResponse.json({ ok: false, error: "ADMIN_TOKEN 未配置" }, { status: 500 });
  }
  try {
    const r = await fetch(`${SITE_URL}/api/admin/init-db`, {
      method: "POST",
      headers: { Authorization: `Bearer ${adminToken}` },
      cache: "no-store",
    });
    const body = await r.json().catch(() => ({}));
    // 透传结果与状态码:init-db 失败 → 非 2xx → 工作流 curl -f 打红(第二告警通道)
    return NextResponse.json(
      { ok: r.ok, initDb: body },
      { status: r.ok ? 200 : 502 }
    );
  } catch (e) {
    return NextResponse.json({ ok: false, error: String(e) }, { status: 502 });
  }
}
