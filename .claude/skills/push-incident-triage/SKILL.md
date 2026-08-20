---
name: push-incident-triage
description: 排查「简报/早报/推送没收到」类事故的标准流程。用户说"没收到推送/邮件/简报"、"今早没推"或要求排查推送问题时使用。只排查取证给结论,不改代码;补救和修复都要用户点头。
---

# 简报/推送事故排查(StockTell)

## 铁律
- **排查 ≠ 修复**:产出 = 根因结论 + 证据 + 时间线 + 修复建议。不改代码、不提交,修复等用户明确指令。
- 运维补救(补发邮件等对外动作)时效紧迫时可做,但先向用户说明。
- 先取证后下结论:2026-07-03 事故里"完全没发"的推断被 Resend 记录纠正为"发了 6/11 被截断"——**发送日志是铁证,推断只是推断**。

## 背景(链路,北京时间;cron 定义在 vercel.json,UTC)
07:00 `cron/briefing`:生成(LLM)→ 发布 → runPreOpenDigest(邮件,逐用户)→ runWebPush。
07:40 `cron/briefing-backup` 幂等补位;08:30 `cron/briefing-watchdog` 飞书心跳(✅/❌,核对简报存在 + 当日 digest_send_log 条数)。
凭据都在本地 `.env.local`:ADMIN_TOKEN / CRON_SECRET / RESEND_API_KEY。

## 排查步骤(按序,全部只读)
1. **对齐事实**:确认"今天"用北京时区(todayISO=Asia/Shanghai)、是否 A 股交易日;问清用户看的哪个渠道/邮箱(gmail 和 163 可能一个发了一个没发)。
2. **简报层**:`GET /api/admin/digest-funnel`(Bearer ADMIN_TOKEN)→ 今天简报几条、订阅/命中漏斗。
   `GET /api/briefing?date=YYYY-MM-DD` → 逐条 createdAt + status:**几批?几点落库?draft 还是 published?**(落库时间能反推 cron 启动时间和是否超时)
3. **发送层(铁证,最优先)**:`GET https://api.resend.com/emails?limit=50`(Bearer RESEND_API_KEY)→ 今早发了几封、几点、发给谁、last_event:
   - `delivered` = 已送达(用户说没收到 → 让 TA 翻垃圾箱/确认邮箱)
   - `bounced` = 硬退信,该地址随后进抑制名单
   - `suppressed` = **假成功**:API 返回 ok 但根本不投递
4. **旁证**:看门狗返回值(`GET /api/cron/briefing-watchdog`,Bearer CRON_SECRET)有 digestSent 计数;问用户飞书心跳/告警当天有没有响、内容是什么。
5. **通道自检**:`POST /api/admin/mail-test {to}`(Bearer ADMIN_TOKEN)→ Resend 通道现在通不通。

## 已知失败模式速查
| 症状 | 根因 | 案例 |
|---|---|---|
| 简报 0 条 + 全天无告警 | cron 没触发(计划过渡/额度) | 2026-07-01 |
| 简报在,邮件部分/全部没发 | 函数超时截断(生成+推送串行);已修 maxDuration=300+告警,复发则查函数耗时 | 2026-07-03 |
| 生成 0 条 + 有告警 | 隔夜美股 movers 抓空/行情陈旧 | 2026-06-29 |
| 个别用户丢邮件 | Resend 429 限流(已节流重试)或 bounced/suppressed | peggiezhou 07-01 |
| delivered 但用户说没收到 | 垃圾箱,或用户看的是另一个邮箱 | feng5166@gmail 07-03 |
| 补发报成功但用户没收到 | 抑制名单假成功(suppressed) | liufebgxueye 07-03 |

## 补救 runbook(经用户同意后)
1. `POST /api/admin/mail-test {to}` 先验通道。
2. 简报缺失:`POST /api/briefing/generate?replace=1&llm=1`(Bearer ADMIN_TOKEN)。
3. 邮件补推:`POST /api/admin/push-digest` —— **默认只补当天没发过的**(digest_send_log 幂等);确要全量重发加 `?force=1`。返回 candidates/sent/alreadySent/failed。
4. Web Push 补推:`GET /api/cron/push-web`(Bearer CRON_SECRET)。
5. 飞书:`GET /api/cron/push-feishu`(Bearer CRON_SECRET)。
6. 单用户抽查/定向补:`POST /api/admin/digest-preview {email 或 userId, to?}`(发本人真实地址会计入当日已发)。

## 收尾
- 给用户:结论先行(谁没收到/为什么/补了没),证据和时间线随后。
- 上线事故写 `docs/postmortem-YYYY-MM-DD-<slug>.md`(参考 07-01/07-03 两篇的结构:概述/影响/时间线/根因/处置/修复/残留)。
- 修复项列清单等用户排优先级,**不要顺手就改**。
