// 接口监控:埋点 API 路由的调用次数 / 响应时间 / 错误 / 慢响应,聚合落 DB(api_metric),
// 后台 /admin/metrics 可视化;并在慢响应/报错时给飞书告警(带冷却,不刷屏)。
import type { NextRequest } from "next/server";
import { getPrisma } from "@/lib/prisma";
import { sendFeishu } from "@/lib/feishu";

// 慢阈值:响应 ≥ 此值记一次 slow 并触发告警(默认 8s,接近各路由 maxDuration 前预警)。
const SLOW_MS = Number(process.env.API_SLOW_MS ?? 8000);
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

async function recordApiMetric(route: string, ms: number, ok: boolean): Promise<void> {
  const db = getPrisma();
  if (!db) return;
  const ymd = todayYmdSH();
  const dur = Math.max(0, Math.round(ms));
  const err = ok ? 0 : 1;
  const slow = ms >= SLOW_MS ? 1 : 0;
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
  if (ok && ms < SLOW_MS) return; // 正常且不慢,不打扰
  const now = Date.now();
  if (now - (lastAlertAt.get(route) ?? 0) < ALERT_COOLDOWN_MS) return;
  lastAlertAt.set(route, now);
  const reason = !ok
    ? `报错(${Math.round(ms)}ms)`
    : `慢响应 ${Math.round(ms)}ms(阈值 ${SLOW_MS}ms)`;
  await sendFeishu(
    `⏱️ StockTell 接口告警 | /api/${route}\n${reason}\n${ALERT_COOLDOWN_MS / 60000}分钟内同路由不再重复提醒`
  ).catch(() => {});
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
      const ms = Date.now() - t0;
      // await 保证 serverless 冻结前写入(单次 upsert 很快);告警有冷却、很少触发。
      await recordApiMetric(route, ms, ok);
      await maybeAlert(route, ms, ok);
    }
  };
}
