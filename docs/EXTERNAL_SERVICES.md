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
| `CLAWBOT_BASE_URL` / `CLAWBOT_SECRET` | 自建微信桥 | 微信 iLink 推送;`https://bridge.stocktell.me`(宝塔 nginx 反代 VPS 47.84.8.167) |
| `FEISHU_BOT_APP_ID` / `FEISHU_BOT_APP_SECRET` / `FEISHU_USER_OPEN_ID` | 飞书机器人 | 给运营者本人推送简报 |
| `CRON_SECRET` | Vercel Cron | 定时任务鉴权(Bearer) |
| `ADMIN_TOKEN` | 后台 | 管理端点鉴权(Bearer);如 init-db |
| `ADMIN_EMAILS` | 后台 | 管理员邮箱白名单(逗号分隔) |
| `UNSUB_SECRET` | 邮件退订 | 退订链接 HMAC 签名(未配则回退 NEXTAUTH_SECRET) |
| `NEXT_PUBLIC_UMAMI_SRC` / `NEXT_PUBLIC_UMAMI_WEBSITE_ID` | Umami(分析) | 自托管网页分析:pageview + 自定义事件(漏斗/留存) |
| `NEXT_PUBLIC_CLARITY_ID` | Microsoft Clarity | 会话回放 + 热力图(免费、自动屏蔽输入/PII) |

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
- **环境变量**:`LLM_BASE_URL` / `LLM_API_KEY` / `LLM_MODEL`;为什么动另有 `WHY_ENABLED` / `WHY_LLM_MODEL`。`LLM_API_KEY` 2026-07-01 轮换过(改 env 后需重部署才生效)。
- **主/兜底**:ModelVerse 为主,**DeepSeek 官方 API 为兜底**;劣化时 `/admin/llm` **运行时手动切换**(两家模型名一致,一键链接);劣化会飞书提醒但**不自动切**。
- **坑**:reasoning 模型会先吐 `reasoning_content` 吃 token,`max_tokens` 要给够;60s 限制下用并发(每条一调)+ 模板兜底。

---

## 4. 行情 / 金融数据

| 服务 | 用途 | 关键文件 | 备注 |
|---|---|---|---|
| **新浪行情** `hq.sinajs.cn` / `finance.sina.com.cn` | A股/美股实时行情 | `src/lib/quotes.ts` | 免 key;失败读 `quotes_cache` |
| **东方财富** `push2his.eastmoney.com` / `quote.eastmoney.com` | 美股历史日线、A股资金面 | `src/lib/history.ts`、`src/lib/us-history.ts` | 免 key;**会封 Vercel IP**(美股历史改用 Yahoo) |
| **Tushare** `api.tushare.pro` | 交易日历(trade_cal)/ 基本面(daily_basic)/ 资金面(moneyflow/top_list/margin)/ **雷区雷达**(share_float 解禁、stk_holdertrade 增减持、pledge_stat 质押、repurchase 回购、namechange ST 判定)/ **财报体检**(income/balancesheet/cashflow/fina_indicator)/ **相似性**(dailyHistory 2年日线) | `src/lib/tushare.ts`、`risk-radar.ts`、`financials.ts`、`similarity.ts`、`api/fundamentals`、`api/similarity` | 需 `TUSHARE_TOKEN`(6000积分)。**缓存(2026-07-01 起)**:基本面/资金面/雷区/财报/相似性结果落 **DB 跨实例缓存**——`quotes_cache`(按 `<类>:code:当天`)+ `fund_day_cache`(按 ymd),**非 `unstable_cache`**(Vercel 不跨实例、冷启重打)。失败用 `tsCallStrict` 区分「回源失败 vs 成功但空行」:**只在确有回源时才写缓存(不毒化)** + `alertThrottled` 飞书告警。仅 `fundFlowFor` 批量外层仍留轻量 unstable_cache(内层 bundle 已 DB 缓存) |
| **Yahoo Finance** `query1.finance.yahoo.com` | 美股历史日线(相似性用) | `src/lib/yahoo.ts` | 免 key;Tushare us_daily 要付费 + 东财封 IP,故走 Yahoo |

---

## 5. 搜索

### 博查 Bocha Web Search — `api.bochaai.com`
- **用途**:「为什么动」真实新闻检索(避免编造)。
- **关键文件**:`src/lib/bocha.ts`(端点 `POST /v1/web-search`)。
- **环境变量**:`BOCHA_API_KEY`(没配则返回 null,调用方降级,不编造)。
- **⚠️ 区域坑(必看)**:`api.bochaai.com` 解析到**阿里云北京 SLB**,**Vercel 美区(iad1)连不上**(报 `fetch failed`)。因此调博查的接口**必须钉香港区**:`src/app/api/briefing/why/route.ts` 与 `src/app/api/admin/why-diag/route.ts` 都有 `export const preferredRegion = "hkg1"` —— **别删**,删了「为什么动」来源会再次消失。
- **诊断**:`GET /api/admin/why-diag`(管理员登录即可)报 key 是否存在/博查 HTTP 状态/命中数/实际执行区/LLM 状态;`?clear=1` 清 `whyCache`(旧 null 结果会挡新数据)。bocha.ts 失败也会 `console.warn`(Vercel 日志可见 401/402/429)。

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

### 自建微信桥(ClawBot / iLink)— `https://bridge.stocktell.me`(VPS 47.84.8.167)
- **用途**:微信 iLink 推送(扫码绑定 + 盘前/手动推送)。
- **关键文件**:站点侧 `src/lib/clawbot.ts`;桥侧 `ilink-bridge/server.mjs`(部署在 VPS,systemd 单元 `ilink-bridge`,监听本机 `127.0.0.1:8787`)。
- **环境变量**:`CLAWBOT_BASE_URL=https://bridge.stocktell.me` / `CLAWBOT_SECRET`(请求头 `x-clawbot-secret`,= 桥 `BRIDGE_SECRET`)。
- **访问链路**:Vercel → `https://bridge.stocktell.me`(443)→ **宝塔 nginx 反向代理** → `127.0.0.1:8787`。8787 不对公网开放。
- **坑**:`sendmessage` 每条需全局唯一 client_id;context_token 要用户先发消息才拿得到;微信 24h 回复窗口;连续 3 次硬失败自动判失效。详见微信桥相关记忆。

### HTTPS 反向代理 + 证书(宝塔 nginx + Let's Encrypt)— VPS 47.84.8.167
- **依赖性质**:外部基础设施。`bridge.stocktell.me` 的 TLS 终止在 VPS 上的**宝塔托管 nginx**,反代到桥 `127.0.0.1:8787`。
- **DNS**:`bridge.stocktell.me` A 记录 → 47.84.8.167(DNS 托管在 **Vercel**,非阿里云)。
- **证书**:Let's Encrypt(宝塔申请),**90 天有效**;宝塔**默认自动续期**(`/www/server/panel/script/renew_certificate.py`)。
- **续期监控(安全网)**:`/api/cron/cert-check` 每日(GH Actions `feishu-push` 工作流内)检查剩余天数,**< 14 天发飞书告警**——防自动续期失败无人知。
- **宝塔面板**:`https://pkhere.com:36540/57fc0c3f`(强制 https + 绑域名 pkhere.com)。

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

## 8. 分析 / Analytics

### Umami(自托管)— `analytics.stocktell.me`
- **用途**:pageview + 自定义事件(`umami.track`),漏斗/留存看板。
- **关键文件**:`src/app/layout.tsx`(注入 script.js)、`src/lib/analytics.ts`(`track()` 封装);事件清单 `docs/埋点需求.md`。
- **env**:`NEXT_PUBLIC_UMAMI_SRC` / `NEXT_PUBLIC_UMAMI_WEBSITE_ID`。websiteId=`f07470dd-c040-4f45-a774-44148f249d5f`。
- 后台已建 6 个看板(核心增长 / 登录轻推 / 美股桥 / 分享病毒环 / 落地页订阅 漏斗 + 用户留存)。⚠️ 自托管管理员口令务必用强密码(公网可访问);临时账号用完即删。

### Microsoft Clarity — `clarity.microsoft.com`(会话回放 + 热力图)
- **用途**:录真实用户**会话回放** + **点击热力图** + rage-click,盯种子用户体验/卡点。
- **为什么不用 Umami 的「回放」**:自托管 OSS 版开不了(网站 `recorderEnabled` 经 API 改不动、疑似 Cloud 功能),故用 Clarity(免费无限量、成熟、默认屏蔽输入/PII)。
- **关键文件**:`src/app/layout.tsx`(inline 脚本,配了 `NEXT_PUBLIC_CLARITY_ID` 才注入)。
- **env**:`NEXT_PUBLIC_CLARITY_ID`(2026-07-02 接入;project id 是公开值)。数据在 Clarity 侧看,不进我们 DB。

---

## 数据脚本(AI 产业链股票池)

- `npm run data-check`(`scripts/data-check.mjs`)— 数据自检:重复 code / 非法 sector / relations 引用 / chainEdges 两端 / 孤儿统计;硬错误退出非零。已接入 `scripts/smoke.sh`。
- `npm run enrich`(`scripts/enrich-tushare.mjs`)— 用 Tushare `daily_basic` 拉 流通市值/换手(近5日均)/PE,派生 市值档+热度,生成 `src/data/enrichment.generated.ts`(静态、运行时零外部调用)。换数据/定期刷新时重跑。
- `npm run enrich-concepts`(`scripts/enrich-concepts.mjs`)— 用 Tushare 同花顺概念 `ths_index`/`ths_member`(**需 6000 积分**)给 A 股打"概念归属"多标签(AI产业链主题白名单过滤),生成 `src/data/concepts.generated.ts`。
- `npm run gen-takes`(`scripts/gen-retail-takes.mjs`)— LLM(deepseek-v4-flash)并发逐只生成"散户怎么想"人话结论,生成 `src/data/retail-takes.generated.ts`。
- 股票池数据源:`src/data/stocks.ts`(标的+canonical sector,`SECTORS`/`SECTOR_GLOSS`/`TIER`)、`src/data/chainEdges.ts`(产业链边)、`src/data/relations.ts`(美股→A股映射)。
- **定时刷新**:`.github/workflows/refresh-data.yml` 每周六 17:00(北京)跑 `enrich` + `enrich-concepts`,重生成 `*.generated.ts` 并提交回 main → 触发 Vercel 部署。需在 **GitHub 仓库 Secrets** 加 `TUSHARE_TOKEN`(与 Vercel 同值)。脚本已支持从 `process.env.TUSHARE_TOKEN`(CI)或 `.env.local`(本地)读 token。

## 暂未接入(评估记录)

- **短网址服务**:目前**未接**,微信/邮件里都是完整 `stocktell.me/...`。若要做,优先考虑**站内 `stocktell.me/s/<code>`**(复用 Vercel+Postgres,同域名被微信信任,免新基建);其次才是 VPS 自建。
- **Redis / Upstash**:目前**未接**——高频缓存暂由 **Postgres 承担**(`quotes_cache` 单行 id→json + `fund_day_cache`,拿 DB 当跨实例缓存层)。2026-07-01 多专家评估 + 对抗验证结论=**当前(29 用户/低流量)不引入**:
  - DB 单行主键点查/点写亚毫秒、Neon pooler 已挡 serverless 扇出,**到数百 DAU 前不是瓶颈**;会先炸的(`api_metric` 单行热点、`risk-radar` 逐票扇出)**Redis 都救不了**。
  - 唯一真"高危缺口"(简报重复生成 / 邮件重复群发)正解是 **DB 唯一约束**;限流跨实例失效用 **PG 原子计数**即可强一致——都零新依赖、更彻底。
  - **量化触发器(到点再上,且只接锁/额度/限流,不接热缓存)**:①撞库/找回轰炸迹象 → `@upstash/ratelimit`(`rate-limit.ts` 接口 `rateLimit(key,limit,windowMs)` 已预留,平移零改);②常驻热实例 ≥8 或 `fetch-fail` 告警集中 → `SET NX` 锁只包最贵的全市场整包回源(`fund-bundle:ymd`);③fundamentals/similarity 日调用上千 / DAU 300–500 → 才整体搬热缓存。
  - **硬约束**:Redis 只软接(命中即用、挂了绕过回落 PG→直算),**永不成新单点**。完整评估见记忆 `stocktell-storage-tiering-decision`。
