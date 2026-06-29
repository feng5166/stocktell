import { NextRequest, NextResponse } from "next/server";
import { getPrisma } from "@/lib/prisma";
import { verifyUnsub, unsubUrl } from "@/lib/unsub";

export const dynamic = "force-dynamic";

// 邮件"取消推送":带 HMAC 签名,免登录。
// GET  → 点邮件按钮:退订并返回确认页(含"重新订阅"撤销)。?action=resub 则重新订阅。
// POST → 邮件客户端原生一键退订(RFC 8058 List-Unsubscribe-Post),只退订、返回 200。

function page(title: string, body: string, status = 200) {
  const html = `<!doctype html><html lang="zh-CN"><head>
<meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>${title} · StockTell</title></head>
<body style="margin:0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;background:#f7f8fa;color:#1a1d24">
<div style="max-width:440px;margin:14vh auto 0;padding:28px 24px;background:#fff;border:1px solid #eee;border-radius:16px;text-align:center">
${body}
</div></body></html>`;
  return new NextResponse(html, {
    status,
    headers: { "content-type": "text/html; charset=utf-8" },
  });
}

async function setOptOut(userId: string, optOut: boolean): Promise<boolean> {
  const db = getPrisma();
  if (!db) return false;
  try {
    await db.user.update({ where: { id: userId }, data: { digestOptOut: optOut } });
    return true;
  } catch {
    return false; // 用户不存在等
  }
}

export async function GET(req: NextRequest) {
  const u = req.nextUrl.searchParams.get("u") || "";
  const t = req.nextUrl.searchParams.get("t") || "";
  const action = req.nextUrl.searchParams.get("action");
  if (!verifyUnsub(u, t)) {
    return page("链接无效", `<h2 style="font-size:18px;margin:0 0 8px">链接无效或已过期</h2>
      <p style="color:#888;font-size:14px;margin:0">请直接在 <a href="/" style="color:#2563eb">StockTell</a> 站内设置推送偏好。</p>`, 400);
  }
  const base = process.env.NEXTAUTH_URL || "https://stocktell.me";

  if (action === "resub") {
    const ok = await setOptOut(u, false);
    return page(
      ok ? "已重新订阅" : "操作失败",
      ok
        ? `<h2 style="font-size:18px;margin:0 0 8px">已为你重新开启每日推送 ✅</h2>
           <p style="color:#888;font-size:14px;margin:0">交易日盘前会继续给你发相关动态。<a href="${base}" style="color:#2563eb">回首页</a></p>`
        : `<h2 style="font-size:18px;margin:0 0 8px">操作失败</h2><p style="color:#888;font-size:14px">请稍后再试。</p>`
    );
  }

  const ok = await setOptOut(u, true);
  const resub = `${unsubUrl(base, u)}&action=resub`;
  return page(
    ok ? "已取消推送" : "操作失败",
    ok
      ? `<h2 style="font-size:18px;margin:0 0 10px">已为你取消每日推送 🔕</h2>
         <p style="color:#888;font-size:14px;margin:0 0 18px">之后不会再给你发盘前邮件。</p>
         <a href="${resub}" style="display:inline-block;background:#111;color:#fff;font-size:14px;text-decoration:none;padding:10px 20px;border-radius:10px">手滑了?重新订阅</a>`
      : `<h2 style="font-size:18px;margin:0 0 8px">操作失败</h2><p style="color:#888;font-size:14px">请稍后再试。</p>`
  );
}

// 邮件客户端一键退订:只接受签名正确的请求,退订后返回 200
export async function POST(req: NextRequest) {
  const u = req.nextUrl.searchParams.get("u") || "";
  const t = req.nextUrl.searchParams.get("t") || "";
  if (!verifyUnsub(u, t)) {
    return NextResponse.json({ ok: false }, { status: 400 });
  }
  const ok = await setOptOut(u, true);
  return NextResponse.json({ ok });
}
