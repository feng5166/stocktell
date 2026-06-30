// 接口监控:埋点 API 路由的调用次数 / 响应时间 / 错误 / 慢响应,聚合落 DB(api_metric),
// 后台 /admin/metrics 可视化;并在慢响应/报错时给飞书告警(带冷却,不刷屏)。
import type { NextRequest } from "next/server";
import { getPrisma } from "@/lib/prisma";
import { sendFeishu } from "@/lib/feishu";

// 慢阈值:响应 ≥ 此值记一次 slow 并触发告警(默认 8s,接近各路由 maxDuration 前预警)。
const SLOW_MS = Number(process.env.API_SLOW_MS ?? 8000);
// 按 label 放宽阈值:LLM 生成类本就 10-25s 属正常,用 8s 会刷误告警。
// key 同时覆盖路由名与 chatTimed 的 "llm:*" label。
const SLOW_OVERRIDE: Record<string, number> = {
  "morning-brief": 25000,
  "briefing-explain": 30000,
  "briefing-why": 22000,
  "llm:morning-brief": 25000,
  "llm:why-rag": 22000,
  "llm:why-legacy": 22000,
  "llm:briefing": 90000, // 简报生成是离线 cron 重活,极慢属正常
};
const slowOf = (label: string) => SLOW_OVERRIDE[label] ?? SLOW_MS;
// 同一路由的告警冷却(进程内,尽力而为),避免抖动期飞书被刷屏。
const ALERT_COOLDOWN_MS = Number(process.env.API_ALERT_COOLDOWN_MS ?? 10 * 60 * 1000);
const lastAlertAt = new Map<string, number>();

// Asia/Shanghai 当日 YYYYMMDD(按交易日维度聚合)
function todayYmdSH(): string {
  const s = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
  return s.replace(/-/g, "");
}

// 通用计时记录:按 label(路由名 / "llm:用途" 等)+ 日 聚合落 api_metric。供接口与 LLM 共用。
export async function recordTiming(route: string, ms: number, ok: boolean): Promise<void> {
  const db = getPrisma();
  if (!db) return;
  const ymd = todayYmdSH();
  const dur = Math.max(0, Math.round(ms));
  const err = ok ? 0 : 1;
  const slow = ms >= slowOf(route) ? 1 : 0;
  await db
    .$executeRawUnsafe(
      `INSERT INTO "api_metric" ("route","ymd","count","sum_ms","max_ms","errors","slow","updated_at")
       VALUES ($1,$2,1,$3,$3,$4,$5,CURRENT_TIMESTAMP)
       ON CONFLICT ("route","ymd") DO UPDATE SET
         "count" = "api_metric"."count" + 1,
         "sum_ms" = "api_metric"."sum_ms" + $3,
         "max_ms" = GREATEST("api_metric"."max_ms", $3),
         "errors" = "api_metric"."errors" + $4,
         "slow" = "api_metric"."slow" + $5,
         "updated_at" = CURRENT_TIMESTAMP`,
      route,
      ymd,
      dur,
      err,
      slow
    )
    .catch(() => {});
}

async function maybeAlert(route: string, ms: number, ok: boolean): Promise<void> {
  const threshold = slowOf(route);
  if (ok && ms < threshold) return; // 正常且不慢,不打扰
  const now = Date.now();
  if (now - (lastAlertAt.get(route) ?? 0) < ALERT_COOLDOWN_MS) return;
  lastAlertAt.set(route, now);
  const reason = !ok
    ? `报错(${Math.round(ms)}ms)`
    : `慢响应 ${Math.round(ms)}ms(阈值 ${threshold}ms)`;
  // llm:* 等带前缀的 label 原样显示;裸路由名补 /api/ 前缀。
  const display = route.includes(":") ? route : `/api/${route}`;
  await sendFeishu(
    `⏱️ StockTell 监控告警 | ${display}\n${reason}\n${ALERT_COOLDOWN_MS / 60000}分钟内同项不再重复提醒`
  ).catch(() => {});
}

// 计时 + 落库 + 慢/错告警 一把梭。接口(withMetrics)与 LLM(chatTimed)共用。
export async function observe(label: string, ms: number, ok: boolean): Promise<void> {
  await recordTiming(label, ms, ok);
  await maybeAlert(label, ms, ok);
}

type RouteHandler = (req: NextRequest, ctx: unknown) => Promise<Response>;

// 包装路由处理器:计时 → 落库 → 慢/错告警。用法:
//   export const GET = withMetrics("chain-sentiment", async (req) => { ... });
export function withMetrics(route: string, handler: RouteHandler): RouteHandler {
  return async (req: NextRequest, ctx: unknown) => {
    const t0 = Date.now();
    let ok = true;
    try {
      const res = await handler(req, ctx);
      ok = res.status < 500;
      return res;
    } catch (e) {
      ok = false;
      throw e;
    } finally {
      // await 保证 serverless 冻结前写入(单次 upsert 很快);告警有冷却、很少触发。
      await observe(route, Date.now() - t0, ok);
    }
  };
}
