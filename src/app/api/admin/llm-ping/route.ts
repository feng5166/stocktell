import { NextRequest, NextResponse } from "next/server";
import { isAdminSession } from "@/lib/admin";

export const dynamic = "force-dynamic";
export const maxDuration = 90;

// 诊断:从 Vercel 函数(hkg1)真调各 LLM 入口的同一小模型(deepseek-v4-flash),比延迟。
// 这才是决定主入口该用哪个的口径(本机/美国测会因地理错位而反向)。token 或 admin session 鉴权。
// 目标:modelverse 两入口(cn/sg,同 LLM_API_KEY)+ DeepSeek 官方(LLM_FALLBACK_API_KEY)。
function targets() {
  return [
    { name: "cn·modelverse.cn", base: "https://api.modelverse.cn/v1", key: process.env.LLM_API_KEY },
    { name: "sg·umodelverse.ai", base: "https://api-sg.umodelverse.ai/v1", key: process.env.LLM_API_KEY },
    { name: "deepseek·official", base: "https://api.deepseek.com", key: process.env.LLM_FALLBACK_API_KEY },
  ];
}

async function timeOne(
  base: string,
  key: string,
  model: string,
  maxtok: number
): Promise<{ ms: number; ok: boolean; status?: number }> {
  const t0 = Date.now();
  try {
    const r = await fetch(`${base}/chat/completions`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
      body: JSON.stringify({
        model,
        max_tokens: maxtok,
        messages: [{ role: "user", content: "用一句话解释什么是市盈率" }],
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

  const rounds = Number(req.nextUrl.searchParams.get("n") ?? 4);
  const model = req.nextUrl.searchParams.get("model") || "deepseek-v4-flash";
  const maxtok = Number(req.nextUrl.searchParams.get("maxtok") ?? 8);
  const out: Record<string, unknown> = {
    region: process.env.VERCEL_REGION ?? "?",
    model,
    maxtok,
  };
  for (const t of targets()) {
    if (!t.key) {
      out[t.name] = { error: "no key" };
      continue;
    }
    const runs: Awaited<ReturnType<typeof timeOne>>[] = [];
    for (let i = 0; i < rounds; i++) runs.push(await timeOne(t.base, t.key, model, maxtok));
    const oks = runs.filter((r) => r.ok).map((r) => r.ms);
    out[t.name] = {
      okCount: oks.length,
      minMs: oks.length ? Math.min(...oks) : null,
      avgMs: oks.length ? Math.round(oks.reduce((a, b) => a + b, 0) / oks.length) : null,
      runs,
    };
  }
  return NextResponse.json({ ok: true, ...out });
}
