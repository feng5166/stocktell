import { NextRequest, NextResponse } from "next/server";
import { STOCK_MAP } from "@/data/stocks";
import { explainMove } from "@/lib/why";
import { rateLimit, clientIp } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";
export const maxDuration = 60; // 冷启动 + 博查检索 + LLM 总结,留足余量避免超时

// 限流:此端点会触发博查检索 + LLM(花钱),且公网无鉴权,挡 (code,date) 遍历刷量。
// 同一 IP 5 分钟最多 30 次(正常用户:首页一次批量 + 偶尔单条,远用不到)。
function limited(req: NextRequest): NextResponse | null {
  const ip = clientIp(req.headers);
  if (!rateLimit(`why:${ip}`, 30, 5 * 60 * 1000).ok) {
    return NextResponse.json(
      { ok: false, error: "操作过于频繁,请稍后再试" },
      { status: 429 }
    );
  }
  return null;
}

// 按需"为什么动":仅前端在「和我相关」卡片上对命中自选的触发标的调用。
// 未开启检索时统一返回 reason:null,前端不显示,绝不编因果。
export async function GET(req: NextRequest) {
  const blocked = limited(req);
  if (blocked) return blocked;
  const code = req.nextUrl.searchParams.get("code") || "";
  const date = req.nextUrl.searchParams.get("date") || "";
  const title = req.nextUrl.searchParams.get("title") || undefined;
  const s = STOCK_MAP[code];
  if (!s) return NextResponse.json({ ok: true, reason: null, asOf: null });
  const r = await explainMove(s.name, s.code, date, title);
  return NextResponse.json({ ok: true, ...r });
}

// 批量版:「和我相关」首屏一次性把所有触发标的的"为什么动"取回,
// 由 N 个卡片各发一次 → 合并成 1 次请求(各 explainMove 在服务端并行,带各自缓存)。
export async function POST(req: NextRequest) {
  const blocked = limited(req);
  if (blocked) return blocked;
  const body = await req.json().catch(() => ({}));
  const items: { code: string; date: string; title?: string }[] = Array.isArray(
    body.items
  )
    ? body.items
    : [];
  const valid = items.filter((it) => it && STOCK_MAP[it.code]).slice(0, 30);
  const entries = await Promise.all(
    valid.map(async (it) => {
      const s = STOCK_MAP[it.code];
      const r = await explainMove(s.name, s.code, it.date, it.title).catch(
        () => ({ reason: null })
      );
      return [it.code, r] as const;
    })
  );
  const results: Record<string, unknown> = {};
  for (const [code, r] of entries) results[code] = r;
  return NextResponse.json({ ok: true, results });
}
