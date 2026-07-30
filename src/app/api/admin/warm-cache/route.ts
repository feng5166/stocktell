import { NextRequest, NextResponse } from "next/server";
import { isAdminAuthorized } from "@/lib/api-guard";
import { isAdminSession } from "@/lib/admin";
import { STOCK_MAP } from "@/data/stocks";
import { SITE_URL } from "@/lib/site";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

// 入池预热(2026-07-30):新股入池当天,五个按日缓存家族(fund/risk/fin/fundflow/sim)全冷,
// 上线当晚第一批访客会集中触发 Tushare 回源——多实例聚合速率瞬间超过账号每分钟上限,
// 打出一波 tushare-fail 告警(07-30 华为链 4 只入池当晚实况)。本端点在扩链后手动跑一次,
// 用【单实例串行】把当日 key 填上(tsCall 自带 5 并发+120ms 节流,单实例串行必不超限)。
// self-fetch 走 SITE_URL(*.vercel.app,同 briefing-backup 口径):预热的就是真实生产路径,
// 缓存逻辑零复制。用法:GET /api/admin/warm-cache?codes=601127,301236(Bearer ADMIN_TOKEN 或 admin session)。
const BUDGET_MS = 280_000; // 距 maxDuration 留 20s 收尾

async function timedFetch(url: string, init: RequestInit, timeoutMs: number) {
  const t0 = Date.now();
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const r = await fetch(url, { ...init, cache: "no-store", signal: ctrl.signal });
    return { ok: r.ok, status: r.status, ms: Date.now() - t0 };
  } catch (e) {
    return { ok: false, status: 0, ms: Date.now() - t0, error: String(e).slice(0, 80) };
  } finally {
    clearTimeout(timer);
  }
}

export async function GET(req: NextRequest) {
  if (!isAdminAuthorized(req) && !(await isAdminSession())) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }
  const raw = (req.nextUrl.searchParams.get("codes") ?? "").split(",").map((c) => c.trim()).filter(Boolean);
  const codes = Array.from(new Set(raw.filter((c) => STOCK_MAP[c]?.market === "A股"))).slice(0, 30);
  if (codes.length === 0) {
    return NextResponse.json({ ok: false, error: "codes 为空或均不在池内(仅收 A 股)" }, { status: 400 });
  }
  const deadlineAt = Date.now() + BUDGET_MS;
  const steps: Array<{ step: string; ok: boolean; status: number; ms: number; error?: string }> = [];
  const run = async (step: string, url: string, init: RequestInit, timeoutMs: number) => {
    if (Date.now() >= deadlineAt) return false;
    steps.push({ step, ...(await timedFetch(url, init, timeoutMs)) });
    return true;
  };

  // 批量族先跑(路由内部自带按天缓存+单飞):risk / fin / fundflow 一次 POST 填全部 code
  const post = (body: object): RequestInit => ({
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  for (const fam of ["risk-events", "fin-checkup", "fund-flow"] as const) {
    if (!(await run(fam, `${SITE_URL}/api/${fam}`, post({ codes }), 55_000))) break;
  }
  // 单票族串行(fundamentals / similarity),票间 300ms 间隔进一步压平速率
  outer: for (const c of codes) {
    for (const fam of ["fundamentals", "similarity"] as const) {
      if (!(await run(`${fam}:${c}`, `${SITE_URL}/api/${fam}?code=${c}`, { method: "GET" }, 20_000))) break outer;
      await new Promise((r) => setTimeout(r, 300));
    }
  }

  const failed = steps.filter((s) => !s.ok);
  const truncated = Date.now() >= deadlineAt;
  return NextResponse.json({
    ok: failed.length === 0 && !truncated,
    codes,
    steps,
    failed: failed.length,
    ...(truncated ? { truncated: true, note: "时间预算耗尽,未跑完的族再调一次即可(已跑的已入缓存)" } : {}),
  });
}
