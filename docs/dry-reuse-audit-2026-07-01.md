# 代码复用 / DRY 专项审查(2026-07-01)

> 起因:退订页脚曾在 digest/risk-radar/email-push 各抄一份,改样式漏了一处(反馈邮件仍显示旧按钮),已抽成 `lib/unsub.ts` 的 `unsubFooter`。本审查全库排查同类「改一处漏几处」的重复,并给共享抽象建议。
> 方法:8 类维度并行扫描 + 每条独立对抗式复核(判「该合并」vs「只是像、不该强合」)。**18 处确认(3 高 / 9 中 / 6 低)**,已剔除过度抽象/误报。**本文件是记录,尚未动手,待人判断优先级。**

## 一、按严重度的重复清单

### 🔴 HIGH

**#1 打分口径手抄 4 文件 → 战绩/命中率/回测/联动有效率口径会悄悄不一致(用户可见)**
- 副本:`generate.ts:15`(MOVER_THRESHOLD=2)、`generate.ts:35-37`(impactFromChange ≥4高/≥2中)、`outcomes.ts:9`(HIT_THRESHOLD=1.0)、`backtest.ts:12-13`(重声明,注释自称"同 generate/outcomes")、`backtest.ts:101`、`linkage.ts:8-9`(US_THRESH=2/A_HIT=1);消费方 `track/page.tsx:7,82` 渲染 {HIT_THRESHOLD}%
- 抽到:新建 `lib/scoring.ts`(MOVER_PCT=2/HIT_PCT=1/IMPACT_HIGH_PCT=4/IMPACT_MID_PCT=2/impactFromChange())。`outcomes.ts` 从 scoring re-export 保住 track 绑定。
- **勿并**:`intraday-alert.ts:11` THRESHOLD=7(盘中异动)、MIN_SAMPLE(10 vs 12)语义不同。

**#2 合规免责话术散 ~16 处、已漂成 6-7 种(合规最敏感,退订同型)**
- 权威 `constants.ts:2 DISCLAIMER` 只被 `page.tsx:87`/`Dashboard.tsx:609` 用;digest/risk-radar/push-weixin/intraday/push-feishu/morning-brief + 深读三组件(StockTellTake/BriefingFeed/DeepRead)+ 功能卡 ~11 处全手写。
- 抽到:`constants.ts`(或 `lib/disclaimer.ts`)按 kind 具名:`DISCLAIMER`(通用)/`DISCLAIMER_RISK`(提示风险)/`DISCLAIMER_PUSH`(短)/`AI_DISCLAIMER`(深读)/`NO_ADVICE` token。
- **勿并成一句**:info/risk/push/AI 四类各自演化;morning-brief 是正文行内括注(且正文会再追加免责,防双重);SiteFooter 整站兜底句不并入。

**#3 鉴权样板逐字抄 ~35 处、分裂成强弱多套(藏真安全隐患)**
- Admin token+session ~14、token-only 3、cron 401 样板 10、会话守卫 ~8、clawbot secret 3(fail-OPEN)、ADMIN_EMAILS 白名单 2。
- **隐患**:`llm-ping:44`/`llm-provider:16` 用 `===` 明文比对 + query-token,**绕过 api-guard 的常量时间比对与 header 取值**;clawbot 三处 fail-OPEN(连不上默认放行)。
- 抽到:扩 `lib/api-guard.ts`:`requireAdminApi(req,{session,queryToken})`/`withCronAuth(handler)`/`requireUserId()`/`isClawbotAuthorized(req)`;ADMIN_EMAILS 抽到零依赖叶子模块供 edge middleware 复用。
- **勿做无参单模具**:init-db 必须 token-only(DB 未起 session 必败)、llm-provider 必须 query-token(飞书手机链接无法带 header)——策略作 opts;clawbot fail-open→closed 是行为变更,需确认 prod 已配 secret 再翻。

### 🟠 MED
- **#4 邮件 HTML 片段全家桶**(外壳 max-width:520 ×4 / 黑底CTA『打开 StockTell 看详情』×3 / 免责p ×3 / 抬头eyebrow ×4 / 卡片框 / 纯文本尾 ×3)在 digest/risk-radar/email-push → 抽 `lib/email-layout.ts`(与 unsub.ts 平行)。勿并 password-reset/unsubscribe/mail-test(事务/单动作各异)。
- **#5 LinkageBadge/StrengthTag/STRENGTH_RANK/LinkageStat 类型** 在 OvernightRadar 与 Dashboard 各一份(tooltip 已漂『的比例』vs『的比例为』)→ `components/badges/LinkageBadge.tsx`;STRENGTH_RANK+compareStrengthDesc 放 `data/relations.ts`。迁移非纯机械(OvernightRadar 内联标缺 edgeInfo fallback)。
- **#6 深读渲染层 renderRich+inlineBold+游标+免责脚** 三组件字节级三连抄 → `components/rich-text.tsx`(纯函数先抽,低风险);整体合并组件需先弥合 UX 差异(重试/track)。
- **#7 数字格式化**绕过 `lib/format.ts`(fmtChange/changeClass 内联重写;带符号亿元 fmtYi 三处)。⚠️ **fmtYi 同名异义**(带符号增量 vs financials 无符号万亿)**必须改名分开**;1 vs 2 位小数参数化 + 统一零值口径(>0 vs >=0)。
- **#8 日期/时区**绕过 `lib/date.ts`(截至北京时间 ×3 / todayYmd / ymd↔ISO ×6 / ymdYearsAgo ×2)→ 增 `fmtBeijingClock/todayYmd/beijingYmd/toYmd/toISODate/ymdYearsAgo`。**勿顺手给 ymdYearsAgo 加时区**(会改回测窗口)。
- **#9 quotes_cache KV 手法** 9 处(findUnique→有数据才 upsert→InputJsonValue 强转→吞错)→ 提成 `lib/kv-cache.ts`(kvGet/kvSet),策略留调用方。勿并强类型表(WhyCache/MorningBriefCache/FundDayCache)。**(并行会话已在用 alertThrottled 重构此块)**
- **#10 base url 兜底** 8 处、已漂(apex×5 / www×2 / localhost×1)→ `siteBaseUrl()` 定死 apex;forgot-password 的 localhost 是 dev 正确行为,做成 NODE_ENV-aware。
- **#11 影响 emoji {高🔴中🟡低🟢}** push-weixin/push-feishu 各写 + admin 下拉内联(`impact.ts IMPACT_META` 权威却被绕过)→ 增 `impactEmoji()`。
- **#12 详情页 loading 骨架**头部已与真实页(改用 SiteHeader)漂移 + 骨架体与 PageSkeleton 逐字重复(用户可见闪烁)→ `loading.tsx` 直接 `return <PageSkeleton/>`。

### 🟡 LOW
- **#13 本地重声明 wire 类型**(Quote/RiskEvent/CheckupFinding/Impact)→ 各组件 `import type`。低危(JSON 边界 any,类型只防编译期错名)。
- **#14 withTimeout 逐字复制**(linkage/route + sentiment,**两份都漏 clearTimeout=定时器泄漏**)→ 并进 `fetch-timeout.ts`;交易日 gate 折进 withCronAuth;onlyAshareCodes 放 stocks.ts。**withTimeout reject 版别硬套 resolve-null 优雅降级变体**。
- **#15 跨端早报标签/开场白/触发股标题** 邮件·微信·Web 各拼(破折号已漂)→ constants LABELS/ALERTS_ONLY_LEDE/headlineText。
- **#16 反馈分类 CATEGORIES** 前端 UI 与后端校验各写(前端加分类·后端漏同步→静默判『其他』)→ `lib/feedback.ts`。
- **#17 LLM 默认模型/base 硬编码** 绕过 llm.ts 已导出常量(`llm.ts:31-43` 三常量+getLLM **无人 import=死代码**)→ 删死代码 或抽 llm-config.ts。
- **#18 MIN_SAMPLE 同名不同值**(outcomes=10 / linkage=12,linkage 那份**死导出**)→ 只改名消歧(LINKAGE_MIN_SAMPLE)不统一数值。

## 二、明确「不该合并」(防过度抽象,12 条精选)
- 免责别压成一句(info/risk/push/AI 各自演化);`fmtYi` 带符号 vs 无符号万亿必须拆;强中弱(强度)vs 高中低(影响)仅共用「中」勿并;`withTimeout` reject 版别套 resolve-null 变体;鉴权别做无参单模具;详情页(SSR 单票)别为去重改用 client 组件(刻意性能设计);NO_ADVICE 只抽尾 token 别合整句;剥离 LLM 免责的 SQL/JS/NL 三机制别强抽;ISO↔ymd 别按 idiom 一把梭(base64url 解码语义不同);LLM primary 默认与 fallback 默认今日同值但两个独立旋钮。

## 三、复用护栏(防「以后再改一处漏几处」)
1. **单一真源 + 新增前先 grep**:打分/话术/格式化/base-url/枚举 落地前先查现有 lib,命中就 import。
2. **发信一律走 `lib/email-layout.ts`**(外壳/CTA/抬头/免责/退订);事务邮件不共享营销 shell。
3. **合规话术唯一来源、按 kind 具名,任何渠道禁内联字面量**;建议加 CI/pre-commit grep 护栏拦裸「不构成投资建议」。
4. **同名不同义必改名消歧**(fmtYi、MIN_SAMPLE);评审看到跨文件同名先确认语义。
5. **消费方组件 `import type` 取 lib 类型,禁本地重声明**。
6. **鉴权走 api-guard,策略作 opts;禁 `===` 明文 + query-token**(必须 timingSafeEqual + header)。
7. **权威常量无人 import = 死代码**:接上或删,别留孤儿误导。
8. **去重优先级 = 副本数 × drift风险 × 改动频率**:合规/退订/base-url/打分口径 高于 类型/日期转换。

## 建议分批
1. **先 #3 鉴权收敛(藏安全隐患)+ #2 免责话术(合规、本轮起因同型)**
2. 再 #1 打分口径(用户可见数字)+ #4 邮件 layout + #5 徽章
3. 低危整洁项(#13 类型 / #8 日期 / #17-18)有空再清

_审查产出:69 agents / 2.4M tokens。完整逐条见本文件;raw 见 workflow 结果。_
