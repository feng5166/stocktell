# 定时任务全量审计与加固 · 2026-07-03

> 起于「派专家 review 现在所有定时任务，看看哪些有漏洞哪些可以优化」。多智能体审计出 106 条发现，经**四轮修复 + 对抗验证**收敛落地。本文记录审计结论、加固要点、以及有意接受的残留。

## 1. 方法

- 全量审计:10 位路由专家(逐个 cron + 依赖链)+ 4 位横切专家(排期一致性/鉴权攻击面/共享基础设施/Vercel 平台语义)→ **106 条候选**,逐条对抗验证。
- 修复后每轮都再派一轮对抗评审「验证修复本身」,收敛轨迹:**106 审计 → 15 → 15 → 7 → 6(第四轮 5 确认+1 可能,已全修)**。多数后续轮次发现的是「修复引入的连带回归」,四轮后趋于干净。
- 相关提交:`eb93aaf`(前三轮)、`eaf3119`(第四轮收尾)。

## 2. 修复分类

### 2.1 可靠性:静默硬杀 = 最危险的一类
Vercel 超时**硬杀不走 catch → alertCron 永不执行**,而多个 cron 能被一个挂起的出网请求拖到硬杀。
- 所有裸出网 fetch 加超时:`clawbot`(iLink 桥,10s)、`feishu`(改用共享 `fetchJsonWithTimeout` 让 **body 读也在超时内**——原来只 abort 了 headers)、`push`(web-push 内置 socket timeout,移除了会泄漏定时器且误报成功的 Promise.race)、`us-history`(东财,briefing 链路里最后一个裸奔的)。
- `push-weixin` / `risk-radar` `maxDuration` 60→300(逐用户串行 × LLM/Tushare 冷路径,60s 必被硬杀)。

### 2.2 交易日闸门(新 `src/lib/trading-gate.ts`)
`isAshareTradingDay` 重构为三态 **`ashareDayStatus`**:`trading` / `closed`(周末=纯日期算术可靠,或 Tushare 确认休市)/ `unknown`(工作日但 Tushare trade_cal 不可用)。
- `tradingDayGate(date, task, { onUnknown })` 统一闸门,收敛四处复制。
- **`onUnknown:"skip"`**(briefing/outcome):会对用户做不可逆动作(生成推送简报/记账)。假日误发/污染战绩不可撤回 → unknown 时跳过 + **告警**(告警是为了不静默漏掉真交易日;真交易日的 Tushare 瞬时抖动由 07:40 补位 + 08:30 看门狗兜底)。
- **`onUnknown:"proceed"`**(risk-radar/push-weixin):纯交付,加闸门前本就无条件交付、不依赖 trade_cal。unknown **照常交付**(与旧行为一致),闸门对它们的价值仅在于确定休市时不空跑。**教训:给一个原本无 Tushare 依赖的交付路径加 fail-closed 闸门,等于凭空塞了个「Tushare 抖动就漏发」的新失败模式**(第四轮评审确认的回归)。
- `weekendFallback` 周末永远 false(可靠),工作日 unknown 的方向由调用方定。

### 2.3 推送幂等 / 补位真正生效
- briefing 幂等看 **`status=published`**(管理员预览的 draft 不再让主/补位全天跳过)。
- **digest 总是跑**:它的 alerts-only 分支(雷区/资金面提醒)不依赖简报,0 条发布/美股休市的交易日照样要发给持仓有异动的用户。`created>0 才跑` 会静默漏掉这批。
- **webpush 独立当日广播标记** `webpush-done:{date}`(quotes_cache):只在**真投递成功**(subs=0 无内容,或 sent>0)才落标记——全失败(sent=0)/0 条/抛错都不落,补位会补广播。digest 有 per-user `digest_send_log` 幂等,webpush 是全体广播无 per-endpoint 幂等,故两者分开判定。
- 补位分支同时补 `chainTake`(链级判断)——主跑发布后被截断时,digest/webpush/chainTake 三样都补齐。
- `briefing-backup` 检查 `r.ok`(不再把 401/500 吞成成功)+ 280s abort 视为 **inconclusive 不告警**(看门狗是真兜底,abort≠失败,避免补位真正管用那天误报)。

### 2.4 数据正确性 / 安全
- `outcomes` 校验 **`Quote.asOf == 记账日`**:停牌/半日休市的票行情源返回停牌前陈旧快照,不校验会把陈旧涨跌当「当日收盘」写进战绩、把 hit 错判。加 `judged/staleSkipped` 统计,**判定率 < 50% 告警**(源全挂/漂移或大面积停牌,否则 evaluated>0 显得"记了"实则全 null)。
- briefing cron 响应用 **`digestSummary` 去 PII**:`runPreOpenDigest` 的 results 含每个订户 email/userId,cron 响应会进平台日志,只回计数。

### 2.5 下线 intraday-alert
盘中异动**双重失效**:① GH Actions 排期被调度器饿死(实测每天约 2 次、漂移出交易窗口)② 唯一通道是已隐藏入口的微信 iLink 桥。删 `.github/workflows/intraday-alert.yml` + 路由 `DISABLED` 守卫。复活前置=接 Web Push/邮件通道 + 迁 Vercel 分钟级 cron + 加发送失败告警/幂等。

## 3. 有意接受的残留(评审确认,不再修)
- **at-least-once 邮件**:主跑发信后、markDigestSent 落库前崩溃 → 补位重发一封。保证送达优先于绝不重复(同 07-03 复盘残留)。
- **并发双播 webpush**:两个真并发调用都过 pre-write 检查 → 双播一次。Vercel cron 触发一次,概率极低。
- **停牌误报**:判定率 <50% 告警在「当期受益股恰好大面积停牌」时会误报;文案已写「源问题或大面积停牌,需核查」不武断。
- **冷路径冗余查询**:recovery 分支 `listBriefing` 跑 3 次(此处 + digest 内 + webpush 内)。冷路径,不值得改签名。
- **briefing/backup unknown 双告警**:去掉了 DB 去重后,Tushare-down 的早上 07:00 + 07:40 各发一条。稀有,可接受(去重机制的裸 catch 会把非冲突 DB 错误误判为已占位而漏告警,权衡后整个移除)。

## 4. 排期现状(vercel.json,UTC → 北京)
| cron | UTC | 北京 | onUnknown | 兜底 |
|---|---|---|---|---|
| risk-radar | `50 22` | 06:50 | proceed | 无(交付型,unknown 照常发) |
| briefing | `0 23` | 07:00 | skip+告警 | backup 07:40 + watchdog 08:30 |
| push-weixin | `10 23` | 07:10 | proceed | 无 |
| briefing-backup | `40 23` | 07:40 | (回调 briefing) | watchdog |
| briefing-watchdog | `30 0` | 08:30 | 默认 fail-open | 心跳自身即兜底 |
| outcome | `30 7` | 15:30 | skip+告警 | 次日 backfill-outcomes |

**未排期(有意)**:push-feishu / push-web(主路径折进 briefing,保留手动)。**已删**:intraday-alert。

## 5. 待办(未做,留给后续)
- push-feishu 排期状态三处声明不一致(yml/route注释/docs),且若排 07:10 会早于 07:40 补位 → 补位发布日飞书推送被跳过。需统一。
- webpush 无 per-endpoint 幂等 → 彻底解需发送日志。
- Resend 抑制名单「假成功」→ 接 Resend webhook(见 briefing-email-reliability 记忆)。
- 用户涨到几十人后 briefing 300s 又会紧 → 拆独立 cron / 队列。

## 6. 2026-07-07 增补:密集窗口稳定性(2.1 第1周)

07-07 canary 实证:07:00 主跑 `listBriefing` 首查撞 P2024 连接池超时(默认 pool_timeout=10s),
主跑整段失败,靠 07:40 补位自愈。三项修复(只修稳定性,不动补位逻辑/业务口径):

- **首查重试**:`lib/db-retry.ts` `dbReadRetry`(2 次,2s/4s 退避,只认瞬态错误码)。
  【只给幂等读用】,写路径不重试(超时可能已提交,重试=重复写;写失败归 07:40 幂等补位管)。
- **pool_timeout 10s→30s**:`lib/prisma.ts` 代码层追加 URL 参数(env 已显式配置则不覆盖);
  connection_limit 不动——抬高会把 Neon 侧连接数顶爆(每 serverless 实例各持一池)。
- **轻微错峰**:risk-radar `50 22`→`40 22`(北京 06:40,其 LLM 长尾不再叠 07:00);
  insight-daily `5 23`→`7 23`(北京 07:07,躲开 briefing 最坏 300s 的尾巴 + 07:05 瞬时叠加)。
  顺序不变:radar → briefing → insight → weixin/feishu(07:10)→ backup(07:40)→ watchdog(08:30)。
- **告警口径**:主跑 catch 的告警改名「briefing(简报生成·主跑)」并注明"07:40 补位将自动重试,
  最终结果以 08:30 看门狗为准"——区分主跑失败与最终失败。
