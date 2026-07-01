import { NextRequest, NextResponse } from "next/server";
import { isAdminSession } from "@/lib/admin";
import { setActiveProvider, getActiveProvider, type LLMProvider } from "@/lib/llm-provider";

export const dynamic = "force-dynamic";

function parseTo(v: string | null): LLMProvider | null {
  return v === "fallback" || v === "primary" ? v : null;
}
const label = (p: LLMProvider) =>
  p === "fallback" ? "兜底 DeepSeek(flash)" : "主 modelverse";

// GET:飞书一键切换(token 鉴权,手机点链接即切);也支持 admin session。无 to 时返回当前状态。
export async function GET(req: NextRequest) {
  const to = parseTo(req.nextUrl.searchParams.get("to"));
  const token = req.nextUrl.searchParams.get("token");
  const okToken = !!process.env.ADMIN_TOKEN && token === process.env.ADMIN_TOKEN;
  const okSession = await isAdminSession();
  if (!okToken && !okSession)
    return new NextResponse("无权限", { status: 401 });
  if (to) {
    await setActiveProvider(to);
    return new NextResponse(`✅ 已切换 LLM 提供方为:${label(to)}`, {
      headers: { "content-type": "text/plain; charset=utf-8" },
    });
  }
  return NextResponse.json({ ok: true, provider: await getActiveProvider() });
}

// POST:后台开关(admin session)
export async function POST(req: NextRequest) {
  if (!(await isAdminSession()))
    return NextResponse.json({ ok: false }, { status: 401 });
  const to = parseTo(req.nextUrl.searchParams.get("to"));
  if (!to) return NextResponse.json({ ok: false, error: "bad to" }, { status: 400 });
  await setActiveProvider(to);
  return NextResponse.json({ ok: true, provider: to });
}
