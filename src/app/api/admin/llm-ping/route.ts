import { NextRequest, NextResponse } from "next/server";
import { isAdminSession } from "@/lib/admin";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// 诊断:从 Vercel 函数(hkg1)真调 modelverse 两个入口的同一小模型,比延迟。
// 这才是决定主入口该用哪个的口径(本机/美国测会因地理错位而反向)。token 或 admin session 鉴权。
const ENDPOINTS: Record<string, string> = {
  cn: "https://api.modelverse.cn/v1",
  sg: "https://api-sg.umodelverse.ai/v1",
};

async function timeOne(
  base: string,
  key: string
): Promise<{ ms: number; ok: boolean; status?: number }> {
  const t0 = Date.now();
  try {
    const r = await fetch(`${base}/chat/completions`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
      body: JSON.stringify({
        model: "deepseek-v4-flash",
        max_tokens: 8,
        messages: [{ role: "user", content: "ping" }],
      }),
      cache: "no-store",
    });
    await r.text();
    return { ms: Date.now() - t0, ok: r.ok, status: r.status };
  } catch {
    return { ms: Date.now() - t0, ok: false };
  }
}

export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get("token");
  const okToken = !!process.env.ADMIN_TOKEN && token === process.env.ADMIN_TOKEN;
  if (!okToken && !(await isAdminSession()))
    return NextResponse.json({ ok: false }, { status: 401 });
  const key = process.env.LLM_API_KEY;
  if (!key) return NextResponse.json({ ok: false, error: "no LLM_API_KEY" }, { status: 500 });

  const rounds = Number(req.nextUrl.searchParams.get("n") ?? 3);
  const out: Record<string, unknown> = { region: process.env.VERCEL_REGION ?? "?" };
  for (const [name, base] of Object.entries(ENDPOINTS)) {
    const runs: Awaited<ReturnType<typeof timeOne>>[] = [];
    for (let i = 0; i < rounds; i++) runs.push(await timeOne(base, key));
    const oks = runs.filter((r) => r.ok).map((r) => r.ms);
    out[name] = {
      okCount: oks.length,
      minMs: oks.length ? Math.min(...oks) : null,
      avgMs: oks.length ? Math.round(oks.reduce((a, b) => a + b, 0) / oks.length) : null,
      runs,
    };
  }
  return NextResponse.json({ ok: true, ...out });
}
