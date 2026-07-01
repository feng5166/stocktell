import { NextRequest, NextResponse } from "next/server";
import { isAdminAuthorized } from "@/lib/api-guard";
import { isAdminSession } from "@/lib/admin";

export const dynamic = "force-dynamic";
export const maxDuration = 60;
// 故意【不钉 preferredRegion】:跑在项目默认区,借此权威读出 VERCEL_REGION,
// 并从该区直连国内数据源(新浪/腾讯/Tushare),给出真实状态码/耗时/错误,
// 坐实"这些源从 Vercel 当前区域到底能不能通、多慢"。

async function probe(
  name: string,
  url: string,
  init: RequestInit,
  timeoutMs = 20000
) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  const start = Date.now();
  try {
    const resp = await fetch(url, { ...init, signal: ctrl.signal, cache: "no-store" });
    const text = await resp.text();
    return {
      name,
      url,
      ok: resp.ok,
      httpStatus: resp.status,
      ms: Date.now() - start,
      bytes: text.length,
      snippet: text.slice(0, 120),
    };
  } catch (e) {
    const cause = (e as { cause?: unknown })?.cause;
    const code = cause as { code?: string; message?: string } | undefined;
    return {
      name,
      url,
      ok: false,
      ms: Date.now() - start,
      error: String(e),
      cause: cause ? String(code?.code ?? code?.message ?? cause) : undefined,
      timedOut: Date.now() - start >= timeoutMs - 500,
    };
  } finally {
    clearTimeout(t);
  }
}

export async function GET(req: NextRequest) {
  if (!isAdminAuthorized(req) && !(await isAdminSession())) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  // 三个源各连一次(与本地对照用同样的 URL/Referer),20s 超时以看清"到底多久/是否被拒"
  const results = await Promise.all([
    probe("sina-新浪", "https://hq.sinajs.cn/list=sh601138", {
      headers: { Referer: "https://finance.sina.com.cn" },
    }),
    probe("tencent-腾讯", "https://qt.gtimg.cn/q=sh601138", {}),
    probe("tushare", "https://api.tushare.pro", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ api_name: "stock_basic", token: "net-diag-probe", params: {} }),
    }),
    // 对照:博查(已知香港能通),验证探针本身没问题
    probe("bocha-对照", "https://api.bochaai.com/v1/web-search", {
      method: "POST",
      headers: { Authorization: "Bearer net-diag-probe", "Content-Type": "application/json" },
      body: JSON.stringify({ query: "test", count: 1 }),
    }),
  ]);

  return NextResponse.json({
    ok: true,
    vercelRegion: process.env.VERCEL_REGION ?? "local", // 权威:默认区就是它
    vercelEnv: process.env.VERCEL_ENV ?? null,
    note: "ms=从本区直连该源的实际耗时;timedOut=true 表示 20s 内未完成(超时/被墙);httpStatus 有值=能连上",
    results,
  });
}
