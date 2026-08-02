// 数据库 DDL 单一来源(2026-07-12,review P1:迁移顺序)。
// 之前 DDL 只活在 /api/admin/init-db 路由里 → 迁移必须等新部署上线后才能跑,
// 存在「新代码 + 旧库」窗口。抽取到本模块后两个入口共用:
//   ① /api/admin/init-db(线上幂等端点,人工/ensure-schema 触发)
//   ② scripts/run-ddl.ts(CI 前置迁移:push 后、Vercel 构建完成前直连库收敛)
// 【维护约定】每加一条改变表/索引形态的 DDL:本文件加常量 + DDL_STATEMENTS 追加 +
// instrumentation.ts 哨兵加一条,三处相邻改。语句必须幂等(IF NOT EXISTS / ADD COLUMN IF NOT EXISTS)。

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
// 订阅快照自选(免登录 D1 个性化,新手路径 v2):匿名订阅只存 codes 不存身份
const ALTER_PUSH_CODES = `ALTER TABLE "push_subscriptions" ADD COLUMN IF NOT EXISTS "codes" text[] NOT NULL DEFAULT '{}'`;

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

// 「事件拆解(原深读)」缓存表(幂等)
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


// insight 管线:insight_docs 表(幂等;PRD docs/prd-insight-pipeline.md)
const T_INSIGHT_DOCS = `CREATE TABLE IF NOT EXISTS "insight_docs" (
  "id" text NOT NULL,
  "slug" text NOT NULL,
  "chain_id" text NOT NULL,
  "date" text NOT NULL,
  "kind" text NOT NULL,
  "status" text NOT NULL DEFAULT 'draft',
  "payload" jsonb NOT NULL,
  "guard" jsonb,
  "review_note" text,
  "reviewed_at" timestamp(3),
  "published_at" timestamp(3),
  "created_at" timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "insight_docs_pkey" PRIMARY KEY ("id")
)`;
const IDX_INSIGHT_SLUG = `CREATE UNIQUE INDEX IF NOT EXISTS "insight_docs_slug_key" ON "insight_docs" ("slug")`;
const IDX_INSIGHT_DATE_STATUS = `CREATE INDEX IF NOT EXISTS "insight_docs_date_status_idx" ON "insight_docs" ("date", "status")`;
const IDX_INSIGHT_CHAIN = `CREATE INDEX IF NOT EXISTS "insight_docs_chain_id_date_kind_idx" ON "insight_docs" ("chain_id", "date", "kind")`;

// 层③ relationReviewQueue 持久化(2.1-W3,幂等)。不变量#4:队列不自动改 staticRelations。
const T_RELATION_REVIEW = `CREATE TABLE IF NOT EXISTS "relation_review_queue" (
  "id" text NOT NULL,
  "code" text NOT NULL,
  "chain_id" text NOT NULL,
  "suggested_type" text,
  "reason" text,
  "source" text NOT NULL,
  "hit_count" integer NOT NULL DEFAULT 1,
  "first_seen" text NOT NULL,
  "last_seen" text NOT NULL,
  "status" text NOT NULL DEFAULT 'pending',
  "note" text,
  "created_at" timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "relation_review_queue_pkey" PRIMARY KEY ("id")
)`;
// V1(四轮 review):唯一键升级为 (code,chain_id,source) 按源分账;旧二元唯一索引删除(幂等)
const DROP_RELATION_REVIEW_OLD_UNIQUE = `DROP INDEX IF EXISTS "relation_review_queue_code_chain_id_key"`;
const IDX_RELATION_REVIEW_UNIQUE = `CREATE UNIQUE INDEX IF NOT EXISTS "relation_review_queue_code_chain_id_source_key" ON "relation_review_queue" ("code", "chain_id", "source")`;
const IDX_RELATION_REVIEW_STATUS = `CREATE INDEX IF NOT EXISTS "relation_review_queue_status_last_seen_idx" ON "relation_review_queue" ("status", "last_seen")`;

// 情境式追问消息表(PR4,prd-trust-chat-pro-intent §5.6):配额按 (user_id, created_at) 计数,
// 索引是配额路径的依赖;缺表时对话接口 fail-closed(拒绝提问)不静默放行。哨兵同步加(instrumentation.ts)。
const T_CHAT_MESSAGE = `CREATE TABLE IF NOT EXISTS "chat_message" (
  "id" TEXT NOT NULL,
  "user_id" TEXT NOT NULL,
  "thread_key" TEXT NOT NULL,
  "insight_slug" TEXT NOT NULL,
  "date" TEXT,
  "anchor_type" TEXT NOT NULL,
  "anchor_id" TEXT NOT NULL,
  "role" TEXT NOT NULL,
  "content" TEXT NOT NULL,
  "result" TEXT,
  "created_at" timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "chat_message_pkey" PRIMARY KEY ("id")
)`;
const IDX_CHAT_USER_CREATED = `CREATE INDEX IF NOT EXISTS "chat_message_user_id_created_at_idx" ON "chat_message" ("user_id", "created_at")`;
const IDX_CHAT_THREAD_CREATED = `CREATE INDEX IF NOT EXISTS "chat_message_thread_key_created_at_idx" ON "chat_message" ("thread_key", "created_at")`;


// 分享短链表(2.3 P0-3 裂变一张卡实验,幂等)
const T_SHORT_LINK = `CREATE TABLE IF NOT EXISTS "short_links" (
  "id" text NOT NULL,
  "code" text NOT NULL,
  "target" text NOT NULL,
  "card_type" text NOT NULL,
  "date" text NOT NULL,
  "hits" integer NOT NULL DEFAULT 0,
  "created_at" timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "short_links_pkey" PRIMARY KEY ("id")
)`;
const IDX_SHORT_LINK_CODE = `CREATE UNIQUE INDEX IF NOT EXISTS "short_links_code_key" ON "short_links" ("code")`;
const IDX_SHORT_LINK_CARD_DATE = `CREATE UNIQUE INDEX IF NOT EXISTS "short_links_card_type_date_key" ON "short_links" ("card_type", "date")`;

// 执行顺序 = 原 init-db 事务体顺序(表先于索引,ALTER 先于依赖它的索引)
export const DDL_STATEMENTS: string[] = [
  T,
  IDX_TOKEN,
  IDX_EMAIL,
  ALTER_BRIEFING,
  T_OUTCOME,
  IDX_OUTCOME_UNIQUE,
  IDX_OUTCOME_DATE,
  ALTER_OUTCOME_BACKTEST,
  IDX_OUTCOME_BACKTEST,
  IDX_OUTCOME_BACKTEST_DATE,
  T_WATCHLIST,
  IDX_WATCHLIST_UNIQUE,
  IDX_WATCHLIST_USER,
  T_PUSH,
  IDX_PUSH,
  ALTER_PUSH_CODES,
  ALTER_USER_WEIXIN,
  IDX_USER_WEIXIN,
  ALTER_USER_WEIXIN_PENDING,
  ALTER_USER_DIGEST_OPTOUT,
  ALTER_USER_INTRADAY_OPTOUT,
  T_INTRADAY_ALERT,
  IDX_INTRADAY_UNIQUE,
  IDX_INTRADAY_USER_DATE,
  ALTER_USER_RISK_OPTOUT,
  ALTER_USER_LAST_LOGIN,
  T_EVENT_ALERT,
  IDX_EVENT_UNIQUE,
  IDX_EVENT_USER,
  T_WEIXIN_BIND,
  IDX_WEIXIN_BIND_TOKEN,
  IDX_WEIXIN_BIND_USER,
  T_WHY_CACHE,
  T_BRIEF_CACHE,
  T_CHAIN_INTEREST,
  IDX_CHAIN_INTEREST_UNIQUE,
  IDX_CHAIN_INTEREST_CHAIN,
  T_QUOTES_CACHE,
  T_DEEP_CACHE,
  T_FUND_DAY,
  T_API_METRIC,
  T_FEEDBACK,
  IDX_FEEDBACK_CREATED,
  T_INSIGHT_DOCS,
  IDX_INSIGHT_SLUG,
  IDX_INSIGHT_DATE_STATUS,
  IDX_INSIGHT_CHAIN,
  T_DIGEST_SEND_LOG,
  IDX_DIGEST_SEND_UNIQUE,
  IDX_DIGEST_SEND_DATE,
  T_RELATION_REVIEW,
  DROP_RELATION_REVIEW_OLD_UNIQUE,
  IDX_RELATION_REVIEW_UNIQUE,
  IDX_RELATION_REVIEW_STATUS,
  T_CHAT_MESSAGE,
  IDX_CHAT_USER_CREATED,
  IDX_CHAT_THREAD_CREATED,
  T_SHORT_LINK,
  IDX_SHORT_LINK_CODE,
  IDX_SHORT_LINK_CARD_DATE,
];
