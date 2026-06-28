import { NextRequest, NextResponse } from "next/server";
import { getPrisma } from "@/lib/prisma";
import { rateLimit, clientIp } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const db = getPrisma();
  if (!db) return NextResponse.json({ exists: false });
  // 限流:挡批量枚举哪些邮箱已注册。同一 IP 5 分钟最多 30 次(正常用户远用不到)。
  const ip = clientIp(req.headers);
  if (!rateLimit(`check-email:${ip}`, 30, 5 * 60 * 1000).ok) {
    return NextResponse.json({ error: "操作过于频繁,请稍后再试" }, { status: 429 });
  }
  const { email } = await req.json();
  if (!email) return NextResponse.json({ error: "缺少 email" }, { status: 400 });
  const user = await db.user.findUnique({
    where: { email: String(email).toLowerCase().trim() },
    select: { id: true }, // 只判存在,避免 select 到生产库尚未建的新列
  });
  return NextResponse.json({ exists: !!user });
}
