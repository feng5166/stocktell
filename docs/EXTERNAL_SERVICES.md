# StockTell 外部服务清单

> **用途**:记录项目依赖的所有外部服务 / 第三方 API / 自建服务,以及对应环境变量和注意事项。
>
> **约定(重要)**:
> 1. **新增任何外部服务前,先查本文档**,确认没有已有方案可复用。
> 2. **接入后立刻更新本文档**(加一行/一节:用途、关键文件、环境变量、坑)。
> 3. 新增环境变量,记得在 **Vercel 项目环境变量**里配置(本地 `.env.local` 仅本地用;线上不读它)。
>
> 最后更新:2026-06-29

---

## 0. 速查:环境变量总表

| 环境变量 | 所属服务 | 说明 |
|---|---|---|
| `POSTGRES_PRISMA_URL` | Vercel Postgres | 连接池(运行时用),Vercel 自动注入 |
| `POSTGRES_URL_NON_POOLING` | Vercel Postgres | 直连(prisma migrate/db push 用),Vercel 自动注入 |
| `NEXTAUTH_URL` | NextAuth | 站点根 URL(也用作邮件/短链里的 base) |
| `NEXTAUTH_SECRET` | NextAuth | JWT 签名密钥 |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | Google OAuth | Google 登录 |
| `NEXT_PUBLIC_GOOGLE_AUTH` | NextAuth(前端) | 是否展示 Google 登录入口 |
| `LLM_BASE_URL` / `LLM_API_KEY` / `LLM_MODEL` | ModelVerse(LLM) | 简报/解读/早报生成。默认模型 `deepseek-v4-pro` |
| `WHY_ENABLED` / `WHY_LLM_MODEL` | LLM(为什么动) | 「为什么动」开关 + 专用模型 |
| `TUSHARE_TOKEN` | Tushare | 交易日历 / 基本面 / 资金面 |
| `BOCHA_API_KEY` | 博查 Bocha Search | 「为什么动」真实新闻检索 |
| `RESEND_API_KEY` / `EMAIL_FROM` | Resend | 发邮件(早报/通知/密码重置/后台群发) |
| `VAPID_PRIVATE_KEY` / `NEXT_PUBLIC_VAPID_PUBLIC_KEY` / `VAPID_SUBJECT` | Web Push | 浏览器/PWA 通知 |
| `CLAWBOT_BASE_URL` / `CLAWBOT_SECRET` | 自建微信桥 | 微信 iLink 推送(VPS 47.84.8.167) |
| `FEISHU_BOT_APP_ID` / `FEISHU_BOT_APP_SECRET` / `FEISHU_USER_OPEN_ID` | 飞书机器人 | 给运营者本人推送简报 |
| `CRON_SECRET` | Vercel Cron | 定时任务鉴权(Bearer) |
| `ADMIN_TOKEN` | 后台 | 管理端点鉴权(Bearer);如 init-db |
| `ADMIN_EMAILS` | 后台 | 管理员邮箱白名单(逗号分隔) |
| `UNSUB_SECRET` | 邮件退订 | 退订链接 HMAC 签名(未配则回退 NEXTAUTH_SECRET) |

---

## 1. 托管与基础设施

### Vercel(托管 / 部署 / Cron)
- **用途**:Next.js 应用托管;push main 自动部署;定时任务(Cron)。
- **限制**:Hobby 计划 Serverless 函数 `maxDuration` 上限 **60s**(LLM 重活要靠并发/流式规避超时)。
- **Cron**:由 `CRON_SECRET` 鉴权(`Authorization: Bearer`),见 `src/app/api/cron/*`。

### Vercel Postgres(底层 Neon)
- **用途**:主数据库。
- **关键文件**:`prisma/schema.prisma`(`POSTGRES_PRISMA_URL` + `POSTGRES_URL_NON_POOLING`)。
- **坑**:Vercel token 解不开加密的环境变量,本地 `prisma db push` 拿不到连接串 → **改库走 `/api/admin/init-db` 端点**(幂等 `CREATE TABLE/ALTER ... IF NOT EXISTS`),需 `Authorization: Bearer <ADMIN_TOKEN>`。
- 不是 Supabase(PRD 旧文档里的 Supabase/dev.db 都不是当前数据源)。

### Prisma(ORM)
- **关键文件**:`prisma/schema.prisma`、`src/lib/prisma.ts`。
- 改 schema 后:改 `init-db` 加对应 `ALTER`,部署后调一次 `init-db` 建列/表。

---

## 2. 认证

### NextAuth v4 + Google OAuth
- **用途**:账号体系(JWT 策略;邮箱密码 + Google 登录)。
- **关键文件**:`src/lib/auth.ts`。
- **环境变量**:`NEXTAUTH_URL` / `NEXTAUTH_SECRET` / `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` / `NEXT_PUBLIC_GOOGLE_AUTH`。

---

## 3. LLM(内容生成)

### ModelVerse(OpenAI 兼容)— `api.modelverse.cn`
- **用途**:今日简报、「StockTell 解读」、个性化早报、「散户怎么想」、「为什么动」总结。
- **关键文件**:`src/lib/llm.ts`(默认模型 `deepseek-v4-pro`,推理模型,慢、流式)。
- **环境变量**:`LLM_BASE_URL` / `LLM_API_KEY` / `LLM_MODEL`;为什么动另有 `WHY_ENABLED` / `WHY_LLM_MODEL`。
- **坑**:reasoning 模型会先吐 `reasoning_content` 吃 token,`max_tokens` 要给够;60s 限制下用并发(每条一调)+ 模板兜底。

---

## 4. 行情 / 金融数据

| 服务 | 用途 | 关键文件 | 备注 |
|---|---|---|---|
| **新浪行情** `hq.sinajs.cn` / `finance.sina.com.cn` | A股/美股实时行情 | `src/lib/quotes.ts` | 免 key;失败读 `quotes_cache` |
| **东方财富** `push2his.eastmoney.com` / `quote.eastmoney.com` | 美股历史日线、A股资金面 | `src/lib/history.ts`、`src/lib/us-history.ts` | 免 key;**会封 Vercel IP**(美股历史改用 Yahoo) |
| **Tushare** `api.tushare.pro` | 交易日历(trade_cal)/ 基本面(daily_basic)/ 资金面(moneyflow/top_list/margin) | `src/lib/tushare.ts` | 需 `TUSHARE_TOKEN`;判断交易日只在交易日生成简报 |
| **Yahoo Finance** `query1.finance.yahoo.com` | 美股历史日线(相似性用) | `src/lib/yahoo.ts` | 免 key;Tushare us_daily 要付费 + 东财封 IP,故走 Yahoo |

---

## 5. 搜索

### 博查 Bocha Web Search — `api.bochaai.com`
- **用途**:「为什么动」真实新闻检索(避免编造)。
- **关键文件**:`src/lib/bocha.ts`(端点 `POST /v1/web-search`)。
- **环境变量**:`BOCHA_API_KEY`(没配则返回 null,调用方降级,不编造)。

---

## 6. 通知 / 推送

### Resend(邮件)
- **用途**:盘前早报、注册通知、密码重置、后台手动群发邮件。
- **关键文件**:`src/lib/mailer.ts`、`src/lib/digest.ts`、`src/app/api/admin/email-push/route.ts`。
- **环境变量**:`RESEND_API_KEY` / `EMAIL_FROM`(没配则降级打印、返回 false,不报错)。
- 邮件均带「取消推送」入口(`src/lib/unsub.ts` HMAC 签名)+ `List-Unsubscribe` 头。

### Web Push / VAPID(浏览器 & PWA 通知)
- **用途**:浏览器/PWA 推送。
- **关键文件**:`src/app/api/push/subscribe/route.ts`、`src/components/pwa/PwaActions.tsx`(`web-push` 库)。
- **环境变量**:`VAPID_PRIVATE_KEY` / `NEXT_PUBLIC_VAPID_PUBLIC_KEY` / `VAPID_SUBJECT`。

### 自建微信桥(ClawBot / iLink)— VPS `47.84.8.167:8787`
- **用途**:微信 iLink 推送(扫码绑定 + 盘前/手动推送)。
- **关键文件**:站点侧 `src/lib/clawbot.ts`;桥侧 `ilink-bridge/server.mjs`(部署在 VPS,systemd 单元 `ilink-bridge`)。
- **环境变量**:`CLAWBOT_BASE_URL`(如 `http://47.84.8.167:8787`)/ `CLAWBOT_SECRET`(请求头 `x-clawbot-secret`)。
- **坑**:`sendmessage` 每条需全局唯一 client_id;context_token 要用户先发消息才拿得到;微信 24h 回复窗口;连续 3 次硬失败自动判失效。详见微信桥相关记忆。

### 飞书机器人 — `open.feishu.cn`
- **用途**:给运营者本人推送简报(非面向用户)。
- **关键文件**:`src/lib/feishu.ts`、`src/app/api/cron/push-feishu/route.ts`。
- **环境变量**:`FEISHU_BOT_APP_ID` / `FEISHU_BOT_APP_SECRET` / `FEISHU_USER_OPEN_ID`。

---

## 7. 杂项工具

### QR 图片渲染 — `api.qrserver.com`
- **用途**:把微信绑定二维码字符串渲染成图片展示。
- **关键文件**:`src/app/settings/SettingsClient.tsx`(及后台绑定流程)。
- 免 key 的公共服务;仅前端 `<img>` 调用。

---

## 暂未接入(评估记录)

- **短网址服务**:目前**未接**,微信/邮件里都是完整 `stocktell.me/...`。若要做,优先考虑**站内 `stocktell.me/s/<code>`**(复用 Vercel+Postgres,同域名被微信信任,免新基建);其次才是 VPS 自建。
