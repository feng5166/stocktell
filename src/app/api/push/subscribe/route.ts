import { NextRequest, NextResponse } from "next/server";
import { getPrisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

// 保存浏览器推送订阅(按 endpoint 去重)
export async function POST(req: NextRequest) {
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
    await db.pushSubscription.upsert({
      where: { endpoint },
      update: { p256dh, auth },
      create: { endpoint, p256dh, auth },
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
