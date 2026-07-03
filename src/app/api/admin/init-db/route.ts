import { NextRequest, NextResponse } from "next/server";
import { getPrisma } from "@/lib/prisma";
import { isAdminAuthorized } from "@/lib/api-guard";

export const dynamic = "force-dynamic";

// 一次性建 password_reset_tokens 表。需 ?token=ADMIN_TOKEN。建完即删。
const T = `CREATE TABLE IF NOT EXISTS "password_reset_tokens" (
  "id" text NOT NULL,
  "email" text NOT NULL,
  "token" text NOT NULL,
  "used" boolean NOT NULL DEFAULT false,
  "expires_at" timestamp(3) NOT NULL,
  "created_at" timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "password_reset_tokens_pkey" PRIMARY KEY ("id")
)`;
const IDX_TOKEN = `CREATE UNIQUE INDEX IF NOT EXISTS "password_reset_tokens_token_key" ON "password_reset_tokens" ("token")`;
const IDX_EMAIL = `CREATE INDEX IF NOT EXISTS "password_reset_tokens_email_idx" ON "password_reset_tokens" ("email")`;

// 简报记账:给 briefing_items 加 trigger_change 列 + 建 briefing_outcomes 表(幂等)
const ALTER_BRIEFING = `ALTER TABLE "briefing_items" ADD COLUMN IF NOT EXISTS "trigger_change" double precision`;
const T_OUTCOME = `CREATE TABLE IF NOT EXISTS "briefing_outcomes" (
  "id" text NOT NULL,
  "briefing_id" text NOT NULL,
  "date" text NOT NULL,
  "title" text NOT NULL,
  "impact" text NOT NULL,
  "code" text NOT NULL,
  "name" text NOT NULL,
  "expected" text NOT NULL,
  "change" double precision,
  "hit" boolean,
  "evaluated_at" timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "briefing_outcomes_pkey" PRIMARY KEY ("id")
)`;
const IDX_OUTCOME_UNIQUE = `CREATE UNIQUE INDEX IF NOT EXISTS "briefing_outcomes_briefing_id_code_key" ON "briefing_outcomes" ("briefing_id", "code")`;
const IDX_OUTCOME_DATE = `CREATE INDEX IF NOT EXISTS "briefing_outcomes_date_idx" ON "briefing_outcomes" ("date")`;

// 回测明牌列(幂等)
const ALTER_OUTCOME_BACKTEST = `ALTER TABLE "briefing_outcomes" ADD COLUMN IF NOT EXISTS "is_backtest" boolean NOT NULL DEFAULT false`;
const IDX_OUTCOME_BACKTEST = `CREATE INDEX IF NOT EXISTS "briefing_outcomes_is_backtest_idx" ON "briefing_outcomes" ("is_backtest")`;
// 战绩页主查询 where isBacktest + orderBy date 的复合索引
const IDX_OUTCOME_BACKTEST_DATE = `CREATE INDEX IF NOT EXISTS "briefing_outcomes_is_backtest_date_idx" ON "briefing_outcomes" ("is_backtest", "date")`;

// 自选/持仓表(幂等)
const T_WATCHLIST = `CREATE TABLE IF NOT EXISTS "watchlist" (
  "id" text NOT NULL,
  "user_id" text NOT NULL,
  "code" text NOT NULL,
  "created_at" timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "watchlist_pkey" PRIMARY KEY ("id")
)`;
const IDX_WATCHLIST_UNIQUE = `CREATE UNIQUE INDEX IF NOT EXISTS "watchlist_user_id_code_key" ON "watchlist" ("user_id", "code")`;
const IDX_WATCHLIST_USER = `CREATE INDEX IF NOT EXISTS "watchlist_user_id_idx" ON "watchlist" ("user_id")`;


// 推送订阅表(幂等)
const T_PUSH = `CREATE TABLE IF NOT EXISTS "push_subscriptions" (
  "id" text NOT NULL,
  "endpoint" text NOT NULL,
  "p256dh" text NOT NULL,
  "auth" text NOT NULL,
  "created_at" timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "push_subscriptions_pkey" PRIMARY KEY ("id")
)`;
const IDX_PUSH = `CREATE UNIQUE INDEX IF NOT EXISTS "push_subscriptions_endpoint_key" ON "push_subscriptions" ("endpoint")`;

// 微信:给 users 加 weixin_open_id 列 + 建微信绑定 token 表(幂等)。
// 修复:schema 加了 weixinOpenId 但生产库缺该列,导致所有登录(查 users)报错。
const ALTER_USER_WEIXIN = `ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "weixin_open_id" text`;
const IDX_USER_WEIXIN = `CREATE UNIQUE INDEX IF NOT EXISTS "users_weixin_open_id_key" ON "users" ("weixin_open_id")`;
// 扫码未激活的时间戳(站内"还差一步"提醒 + 后台待激活统计)
const ALTER_USER_WEIXIN_PENDING = `ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "weixin_pending_scan_at" timestamp(3)`;
// 退订每日邮件推送标记(邮件"取消推送"按钮)
const ALTER_USER_DIGEST_OPTOUT = `ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "digest_opt_out" boolean NOT NULL DEFAULT false`;
// 关闭盘中异动提醒标记(默认开)+ 盘中异动去重表
const ALTER_USER_INTRADAY_OPTOUT = `ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "intraday_opt_out" boolean NOT NULL DEFAULT false`;
const T_INTRADAY_ALERT = `CREATE TABLE IF NOT EXISTS "intraday_alert" (
  "id" text NOT NULL,
  "user_id" text NOT NULL,
  "code" text NOT NULL,
  "date" text NOT NULL,
  "created_at" timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "intraday_alert_pkey" PRIMARY KEY ("id")
)`;
const IDX_INTRADAY_UNIQUE = `CREATE UNIQUE INDEX IF NOT EXISTS "intraday_alert_user_id_code_date_key" ON "intraday_alert" ("user_id", "code", "date")`;
const IDX_INTRADAY_USER_DATE = `CREATE INDEX IF NOT EXISTS "intraday_alert_user_id_date_idx" ON "intraday_alert" ("user_id", "date")`;
// 雷区提醒:关闭开关 + 去重表
const ALTER_USER_RISK_OPTOUT = `ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "risk_opt_out" boolean NOT NULL DEFAULT false`;
// 最近一次登录时间(幂等,可空)
const ALTER_USER_LAST_LOGIN = `ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "last_login_at" timestamp(3)`;
const T_EVENT_ALERT = `CREATE TABLE IF NOT EXISTS "event_alert" (
  "id" text NOT NULL,
  "user_id" text NOT NULL,
  "event_key" text NOT NULL,
  "date" text NOT NULL,
  "created_at" timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "event_alert_pkey" PRIMARY KEY ("id")
)`;
const IDX_EVENT_UNIQUE = `CREATE UNIQUE INDEX IF NOT EXISTS "event_alert_user_id_event_key_key" ON "event_alert" ("user_id", "event_key")`;
const IDX_EVENT_USER = `CREATE INDEX IF NOT EXISTS "event_alert_user_id_idx" ON "event_alert" ("user_id")`;
const T_WEIXIN_BIND = `CREATE TABLE IF NOT EXISTS "weixin_bind_tokens" (
  "id" text NOT NULL,
  "user_id" text NOT NULL,
  "token" text NOT NULL,
  "expires_at" timestamp(3) NOT NULL,
  "used" boolean NOT NULL DEFAULT false,
  "created_at" timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "weixin_bind_tokens_pkey" PRIMARY KEY ("id")
)`;
const IDX_WEIXIN_BIND_TOKEN = `CREATE UNIQUE INDEX IF NOT EXISTS "weixin_bind_tokens_token_key" ON "weixin_bind_tokens" ("token")`;
const IDX_WEIXIN_BIND_USER = `CREATE INDEX IF NOT EXISTS "weixin_bind_tokens_user_id_idx" ON "weixin_bind_tokens" ("user_id")`;

// 「为什么动」全局缓存表(幂等)
const T_WHY_CACHE = `CREATE TABLE IF NOT EXISTS "why_cache" (
  "code" text NOT NULL,
  "date" text NOT NULL,
  "reason" text,
  "as_of" text,
  "source_url" text,
  "source_title" text,
  "source_summary" text,
  "source_site" text,
  "updated_at" timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "why_cache_pkey" PRIMARY KEY ("code","date")
)`;

// 个性化早报每日缓存表(幂等)
const T_BRIEF_CACHE = `CREATE TABLE IF NOT EXISTS "morning_brief_cache" (
  "key" text NOT NULL,
  "brief" text NOT NULL,
  "updated_at" timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "morning_brief_cache_pkey" PRIMARY KEY ("key")
)`;

// 其他产业链「我想要」投票表(幂等)
const T_CHAIN_INTEREST = `CREATE TABLE IF NOT EXISTS "chain_interest" (
  "id" text NOT NULL,
  "chain" text NOT NULL,
  "voter" text NOT NULL,
  "created_at" timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "chain_interest_pkey" PRIMARY KEY ("id")
)`;
const IDX_CHAIN_INTEREST_UNIQUE = `CREATE UNIQUE INDEX IF NOT EXISTS "chain_interest_chain_voter_key" ON "chain_interest" ("chain", "voter")`;
const IDX_CHAIN_INTEREST_CHAIN = `CREATE INDEX IF NOT EXISTS "chain_interest_chain_idx" ON "chain_interest" ("chain")`;

// 行情缓存表(幂等)
const T_QUOTES_CACHE = `CREATE TABLE IF NOT EXISTS "quotes_cache" (
  "id" text NOT NULL,
  "data" jsonb NOT NULL,
  "updated_at" timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "quotes_cache_pkey" PRIMARY KEY ("id")
)`;

// 「散户怎么想·详细解读」缓存表(幂等)
const T_DEEP_CACHE = `CREATE TABLE IF NOT EXISTS "deep_analysis_cache" (
  "briefing_id" text NOT NULL,
  "content" text NOT NULL,
  "updated_at" timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "deep_analysis_cache_pkey" PRIMARY KEY ("briefing_id")
)`;

// 资金面按日缓存表(幂等)
const T_FUND_DAY = `CREATE TABLE IF NOT EXISTS "fund_day_cache" (
  "ymd" text NOT NULL,
  "data" jsonb NOT NULL,
  "updated_at" timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "fund_day_cache_pkey" PRIMARY KEY ("ymd")
)`;

// 接口监控聚合表(幂等)
const T_API_METRIC = `CREATE TABLE IF NOT EXISTS "api_metric" (
  "route" text NOT NULL,
  "ymd" text NOT NULL,
  "count" integer NOT NULL DEFAULT 0,
  "sum_ms" integer NOT NULL DEFAULT 0,
  "max_ms" integer NOT NULL DEFAULT 0,
  "errors" integer NOT NULL DEFAULT 0,
  "slow" integer NOT NULL DEFAULT 0,
  "updated_at" timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "api_metric_pkey" PRIMARY KEY ("route","ymd")
)`;

// 早报每用户当日发送记录表(幂等):补发只补没发过的,重跑幂等
const T_DIGEST_SEND_LOG = `CREATE TABLE IF NOT EXISTS "digest_send_log" (
  "id" text NOT NULL,
  "date" text NOT NULL,
  "user_id" text NOT NULL,
  "mode" text NOT NULL,
  "sent_at" timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "digest_send_log_pkey" PRIMARY KEY ("id")
)`;
const IDX_DIGEST_SEND_UNIQUE = `CREATE UNIQUE INDEX IF NOT EXISTS "digest_send_log_date_user_id_key" ON "digest_send_log" ("date", "user_id")`;
const IDX_DIGEST_SEND_DATE = `CREATE INDEX IF NOT EXISTS "digest_send_log_date_idx" ON "digest_send_log" ("date")`;

// 用户反馈表(幂等)
const T_FEEDBACK = `CREATE TABLE IF NOT EXISTS "feedback" (
  "id" text NOT NULL,
  "user_id" text,
  "email" text,
  "category" text NOT NULL DEFAULT '其他',
  "content" text NOT NULL,
  "path" text,
  "user_agent" text,
  "created_at" timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "feedback_pkey" PRIMARY KEY ("id")
)`;
const IDX_FEEDBACK_CREATED = `CREATE INDEX IF NOT EXISTS "feedback_created_at_idx" ON "feedback" ("created_at")`;

export async function POST(req: NextRequest) {
  if (!isAdminAuthorized(req)) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }
  const db = getPrisma();
  if (!db) return NextResponse.json({ ok: false, error: "no database" }, { status: 500 });
  try {
    // 全部 DDL 包进单个事务:中途任一条失败则整体回滚,不会留半套表结构(B5)
    await db.$transaction(
      async (tx) => {
        await tx.$executeRawUnsafe(T);
        await tx.$executeRawUnsafe(IDX_TOKEN);
        await tx.$executeRawUnsafe(IDX_EMAIL);
        await tx.$executeRawUnsafe(ALTER_BRIEFING);
        await tx.$executeRawUnsafe(T_OUTCOME);
        await tx.$executeRawUnsafe(IDX_OUTCOME_UNIQUE);
        await tx.$executeRawUnsafe(IDX_OUTCOME_DATE);
        await tx.$executeRawUnsafe(ALTER_OUTCOME_BACKTEST);
        await tx.$executeRawUnsafe(IDX_OUTCOME_BACKTEST);
        await tx.$executeRawUnsafe(IDX_OUTCOME_BACKTEST_DATE);
        await tx.$executeRawUnsafe(T_WATCHLIST);
        await tx.$executeRawUnsafe(IDX_WATCHLIST_UNIQUE);
        await tx.$executeRawUnsafe(IDX_WATCHLIST_USER);
        await tx.$executeRawUnsafe(T_PUSH);
        await tx.$executeRawUnsafe(IDX_PUSH);
        await tx.$executeRawUnsafe(ALTER_USER_WEIXIN);
        await tx.$executeRawUnsafe(IDX_USER_WEIXIN);
        await tx.$executeRawUnsafe(ALTER_USER_WEIXIN_PENDING);
        await tx.$executeRawUnsafe(ALTER_USER_DIGEST_OPTOUT);
        await tx.$executeRawUnsafe(ALTER_USER_INTRADAY_OPTOUT);
        await tx.$executeRawUnsafe(T_INTRADAY_ALERT);
        await tx.$executeRawUnsafe(IDX_INTRADAY_UNIQUE);
        await tx.$executeRawUnsafe(IDX_INTRADAY_USER_DATE);
        await tx.$executeRawUnsafe(ALTER_USER_RISK_OPTOUT);
        await tx.$executeRawUnsafe(ALTER_USER_LAST_LOGIN);
        await tx.$executeRawUnsafe(T_EVENT_ALERT);
        await tx.$executeRawUnsafe(IDX_EVENT_UNIQUE);
        await tx.$executeRawUnsafe(IDX_EVENT_USER);
        await tx.$executeRawUnsafe(T_WEIXIN_BIND);
        await tx.$executeRawUnsafe(IDX_WEIXIN_BIND_TOKEN);
        await tx.$executeRawUnsafe(IDX_WEIXIN_BIND_USER);
        await tx.$executeRawUnsafe(T_WHY_CACHE);
        await tx.$executeRawUnsafe(T_BRIEF_CACHE);
        await tx.$executeRawUnsafe(T_CHAIN_INTEREST);
        await tx.$executeRawUnsafe(IDX_CHAIN_INTEREST_UNIQUE);
        await tx.$executeRawUnsafe(IDX_CHAIN_INTEREST_CHAIN);
        await tx.$executeRawUnsafe(T_QUOTES_CACHE);
        await tx.$executeRawUnsafe(T_DEEP_CACHE);
        await tx.$executeRawUnsafe(T_FUND_DAY);
        await tx.$executeRawUnsafe(T_API_METRIC);
        await tx.$executeRawUnsafe(T_FEEDBACK);
        await tx.$executeRawUnsafe(IDX_FEEDBACK_CREATED);
        await tx.$executeRawUnsafe(T_DIGEST_SEND_LOG);
        await tx.$executeRawUnsafe(IDX_DIGEST_SEND_UNIQUE);
        await tx.$executeRawUnsafe(IDX_DIGEST_SEND_DATE);
      },
      { timeout: 30000 }
    );
    const count = await db.passwordResetToken.count();
    return NextResponse.json({
      ok: true,
      message:
        "ready: ...watchlist + push + users.weixin_open_id + weixin_bind_tokens",
      count,
    });
  } catch (e) {
    return NextResponse.json({ ok: false, error: String(e) }, { status: 500 });
  }
}
