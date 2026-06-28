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

export async function POST(req: NextRequest) {
  if (!isAdminAuthorized(req)) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }
  const db = getPrisma();
  if (!db) return NextResponse.json({ ok: false, error: "no database" }, { status: 500 });
  try {
    await db.$executeRawUnsafe(T);
    await db.$executeRawUnsafe(IDX_TOKEN);
    await db.$executeRawUnsafe(IDX_EMAIL);
    await db.$executeRawUnsafe(ALTER_BRIEFING);
    await db.$executeRawUnsafe(T_OUTCOME);
    await db.$executeRawUnsafe(IDX_OUTCOME_UNIQUE);
    await db.$executeRawUnsafe(IDX_OUTCOME_DATE);
    await db.$executeRawUnsafe(ALTER_OUTCOME_BACKTEST);
    await db.$executeRawUnsafe(IDX_OUTCOME_BACKTEST);
    await db.$executeRawUnsafe(T_WATCHLIST);
    await db.$executeRawUnsafe(IDX_WATCHLIST_UNIQUE);
    await db.$executeRawUnsafe(IDX_WATCHLIST_USER);
    await db.$executeRawUnsafe(T_PUSH);
    await db.$executeRawUnsafe(IDX_PUSH);
    await db.$executeRawUnsafe(ALTER_USER_WEIXIN);
    await db.$executeRawUnsafe(IDX_USER_WEIXIN);
    await db.$executeRawUnsafe(T_WEIXIN_BIND);
    await db.$executeRawUnsafe(IDX_WEIXIN_BIND_TOKEN);
    await db.$executeRawUnsafe(IDX_WEIXIN_BIND_USER);
    await db.$executeRawUnsafe(T_WHY_CACHE);
    await db.$executeRawUnsafe(T_BRIEF_CACHE);
    await db.$executeRawUnsafe(T_CHAIN_INTEREST);
    await db.$executeRawUnsafe(IDX_CHAIN_INTEREST_UNIQUE);
    await db.$executeRawUnsafe(IDX_CHAIN_INTEREST_CHAIN);
    await db.$executeRawUnsafe(T_QUOTES_CACHE);
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
