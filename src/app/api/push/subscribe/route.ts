import { NextRequest, NextResponse } from "next/server";
import { getPrisma } from "@/lib/prisma";
import { pushEnabled } from "@/lib/push";
import { STOCK_MAP } from "@/data/stocks";

export const dynamic = "force-dynamic";

// 保存浏览器推送订阅(按 endpoint 去重)。pushEnabled 是唯一开关判定(见 lib/push.ts):
// 停用态不再收新订阅,避免"订了却永远收不到"的静默错觉。
export async function POST(req: NextRequest) {
  if (!pushEnabled())
    return NextResponse.json({ ok: false, error: "push-disabled" }, { status: 503 });
  const db = getPrisma();
  if (!db) return NextResponse.json({ ok: false, error: "no database" }, { status: 500 });
  try {
    const sub = await req.json();
    const endpoint = sub?.endpoint;
    const p256dh = sub?.keys?.p256dh;
    const auth = sub?.keys?.auth;
    if (!endpoint || !p256dh || !auth) {
      return NextResponse.json({ ok: false, error: "invalid subscription" }, { status: 400 });
    }
    // 自选快照(免登录 D1 个性化):白名单过滤到池内代码、封顶 30,匿名不存身份。
    // 客户端不传/传垃圾 → 空数组 = 广播兜底,不拒绝订阅。
    const codes = Array.isArray(sub?.codes)
      ? (sub.codes as unknown[])
          .filter((c): c is string => typeof c === "string" && Object.prototype.hasOwnProperty.call(STOCK_MAP, c))
          .slice(0, 30)
      : [];
    await db.pushSubscription.upsert({
      where: { endpoint },
      update: { p256dh, auth, codes },
      create: { endpoint, p256dh, auth, codes },
    });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ ok: false, error: String(e) }, { status: 500 });
  }
}

// 取消订阅
export async function DELETE(req: NextRequest) {
  const db = getPrisma();
  if (!db) return NextResponse.json({ ok: false }, { status: 500 });
  try {
    const { endpoint } = await req.json();
    if (endpoint) await db.pushSubscription.deleteMany({ where: { endpoint } });
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}
