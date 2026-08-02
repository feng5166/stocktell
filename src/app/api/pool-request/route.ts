import { NextRequest, NextResponse } from "next/server";
import { getPrisma } from "@/lib/prisma";
import { STOCK_MAP } from "@/data/stocks";
import { ETF_CODES } from "@/data/etfs";
import { rateLimit, clientIp } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

const ETF_SET = new Set<string>(ETF_CODES);

// 池外票登记(2.3 P1-2):client 在加入池外自选时上报,miss 变成扩池选题信号。
// 免登录(游客也是需求信号);IP 限流防脚本灌水;只收语法合法且确实池外的 A 股代码。
// 隐私:只存 code+计数,不存身份/IP。
export async function POST(req: NextRequest) {
  const ip = clientIp(req.headers);
  const rl = rateLimit(`pool-req:${ip}`, 20, 60_000);
  if (!rl.ok) return NextResponse.json({ ok: false, error: "rate-limited" }, { status: 429 });

  const body = await req.json().catch(() => ({}));
  const code = String((body as { code?: string }).code ?? "").trim();
  if (!/^\d{6}$/.test(code) || STOCK_MAP[code] || ETF_SET.has(code)) {
    return NextResponse.json({ ok: false, error: "bad-code" }, { status: 400 });
  }
  const db = getPrisma();
  if (!db) return NextResponse.json({ ok: false, error: "unavailable" }, { status: 503 });
  await db.poolRequest
    .upsert({
      where: { code },
      create: { code },
      update: { count: { increment: 1 }, lastSeen: new Date() },
    })
    .catch(() => null); // 表未建等异常不炸给用户(哨兵会告警)
  return NextResponse.json({ ok: true });
}
