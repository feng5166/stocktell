# 复盘报告 · 2026-07-03 简报已生成但盘前邮件/推送未发(超时截断)

> 级别:P2(简报正常在站,盘前邮件/网页推送当日未自动发出;开盘前已人工补齐)。状态:已恢复 + 已加固。

## 1. 概述
2026-07-03(交易日)07:00 主 cron **简报生成、发布正常**(8 条 07:01:15 落库),但**盘前邮件(digest)与网页推送(Web Push)没发出去**。08:00 左右用户发现"今早没收到推送",排查确认后于 08:0x(开盘前)全员补发。

与 07-01 事故(cron 没触发、整天无简报)不同:这次 cron 触发了、简报在,**只有推送段丢了**——正好落在 07-01 加固的所有防线盲区里。

## 2. 影响(已用 Resend 发送记录核实)
- 11 位当日候选中,07:01 实发 **6 封**(07:01:21–47)后函数被杀,**5 人被切掉**(dexter.dai@outlook / qiantusuo@gmail / 459442446@qq / usa.elgs@gmail / feng.5166@163);08:03–04 补发 11 封全部投出,开盘(09:30)前补齐。
- 副作用:07:01 已收到的 6 人今早收到**两封**(补发无 per-user 已发标记,接受重复优于漏发)。
- 连带发现:liufebgxueye@163.com 07:01 硬退信(bounced)进 Resend 抑制名单,08:03 补发对其为 suppressed——**API 返回成功但实际不投递**,该地址已收不到任何邮件(见 §7)。
- Web Push 订阅者未收到推送;已补推(2 订阅,1 发出,1 失效清理)。
- 站内简报全程正常,无数据损坏。

## 3. 时间线(北京时间)
- 07:00:主 `cron/briefing` 触发(实际启动 ≈07:00:47+,Vercel cron 分钟内延迟)。生成(LLM)约 28s,**07:01:15** 8 条简报落库并发布。
- 07:01:21–47:digest 开跑,发出 6 封(Resend 记录)。
- ~07:01:47+:函数撞 `maxDuration = 60` 被 Vercel **硬杀**——剩余 5 用户被切,`runWebPush` 排更后完全没跑。硬杀不走 catch、无任何告警。
- 07:40:`briefing-backup` 戳主流程 → 命中幂等分支"当天已有简报"直接跳过,**不补推送**(设计盲区)。
- 07:54:另有一批 8 条 draft 落库——来路不明的无鉴权 `POST /api/briefing/generate`(该端点不带参数时不校验任何身份,连带发现的独立漏洞;draft 不上站,无用户影响)。
- ~08:00:用户发现没收到推送,发起排查。(08:30 看门狗当时只核对"简报是否存在"→ 本会发 ✅,不会发现此问题。)
- 08:03:`mail-test` 确认 Resend 通道正常 → `POST /api/admin/push-digest` 全员补发 11/11 → `GET /api/cron/push-web` 补推。开盘前恢复完毕。

## 4. 根因分析
**直接原因:生成 + 逐用户推送串行挤在同一个 60s 函数里,生成(LLM)就吃掉了整个预算。**
判据:简报 07:01:15 落库(cron 07:00 触发,生成阶段 ≈ 用满 60s);digest 每用户要打一次 LLM 早报 + Tushare 告警 + 500ms 节流,11 个候选无论如何塞不进剩余时间;Resend 通道当时是好的(mail-test 即刻成功、补发 11/11 全成)。

**为什么防线全失效(每早心跳形同虚设的一天)**
1. `runPreOpenDigest().catch(() => null)`:就算不是硬杀而是抛错,也会被静默吞掉,无告警。
2. `briefing-backup` 幂等以"简报存在"为准 → 生成成功、推送死了,补位不补。
3. `briefing-watchdog` 只核对"简报存在" → 简报在,08:30 会照发 ✅,把事故盖过去。
4. 硬杀(超时)不产生任何应用层信号,唯一痕迹在 Vercel 运行时日志(保留期短)。

## 5. 处置 / 恢复
`POST /api/admin/mail-test`(通道自检 ok)→ `POST /api/admin/push-digest`(11/11 成功)→ `GET /api/cron/push-web`(补推)。开盘前全部补齐。

## 6. 修复与加固(本次上线)
| 修复 | 内容 |
|---|---|
| 超时 | `cron/briefing` `maxDuration` 60→**300**(Pro 上限;生成 ~60s + 11 用户推送 ~2 分钟,300s 有余量);`briefing-backup` 90→300 跟随 |
| 告警 | digest / webpush 失败不再静默吞:catch → 飞书告警;digest 部分失败(failed>0)也告警并附补发命令 |
| 看门狗 | 08:30 心跳升级:除"简报存在"外,**核对当天 `morning_brief_cache` 条数**(digest 发送时逐用户写入,当"邮件流程跑过"的证据)。简报在而缓存 0 条 → ❌ 告警"疑似未发,请补推"而非 ✅ |
| 鉴权 | `POST /api/briefing/generate` 全路径要求管理员(此前不带参数可匿名生成 draft、白烧 LLM) |

## 7. 已知残留 / 后续
- 看门狗的缓存证据是启发式:若某天所有订阅者都没命中相关简报(candidates=0),会误报 ❌(宁误报不漏报);alerts-only 用户不写缓存,不计入证据。
- 逐用户 LLM 早报是推送耗时大头,用户涨到几十人后 300s 也会紧 → 届时把 digest 从 briefing cron 拆成独立 cron / 队列化,或并行化 getMorningBrief。
- 推送成败没有 DB 级发送日志,补发必然对已收到者重复(本次 6 人收到两封)。要彻底解,加 per-user 当日已发标记。
- **假成功**:Resend 对抑制名单地址(硬退信后)返回 API 成功但标 suppressed 不投递 → `sent` 统计虚高、退订/换址无从感知。liufebgxueye@163.com 已处于此状态。后续:接 Resend webhook(bounced/complained→自动置 digestOptOut 或标记地址无效),或发送后轮询 last_event。
- 07:54 那批来路不明的 8 条 draft 仍留库中(不上站、无害);下次 `generate?replace=1` 会顺带清掉。
- 取证便利:RESEND_API_KEY 已存本地 `.env.local`(gitignore),`GET https://api.resend.com/emails?limit=50` 可直接拉发送记录对时间线。
