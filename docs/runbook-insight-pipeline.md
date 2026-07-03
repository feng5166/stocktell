# Runbook · insight 生产管线(M1 运行手册)

> 排障/日常操作。所有写端点需 `Authorization: Bearer $ADMIN_TOKEN`。生产 BASE=https://www.stocktell.me。
> 上线前提:目标库已 `POST /api/admin/init-db`(建 insight_docs 表);vercel.json 已含 07:05 cron。

## 日常(每个交易日)
1. **07:05** cron `/api/cron/insight-daily` 自动生成 AI 链 daily draft → 飞书推「📋 待审」卡片。
2. 点飞书卡片链接 → `/admin/insights` → 审 judgment/heat/mappings/references → **发布上线**(2-5 分钟)。
3. 发布后首页因果链卡 / 链页「今天怎么看这条链」/ insight 详情页「今日更新」区 60~90s 内(ISR)更新。
4. **没来得及审也没关系**(降级发布):三处页面继续显示地板内容(事件条目 + chain-take),不空窗、不泄漏草稿。

## 手动操作
- **重新生成当日草稿**(改了 prompt/数据后):`POST /api/admin/insight-daily?force=1&chain=ai`。base slug 已 published 时,新草稿落 `-r2/-r3` 与线上共存,发布新的会把旧的自动置 superseded。
- **补生成历史某日**:`POST /api/admin/insight-daily?force=1&chain=ai&date=YYYY-MM-DD`(该日须有已发布简报条目)。
- **查看某篇**:`GET /api/admin/insights?id=<docId>`;**列表**:`GET /api/admin/insights`(可 `?status=draft`)。
- **建表**(新库/迁移):`POST /api/admin/init-db`(幂等)。

## 告警与处置
| 飞书告警 | 含义 | 处置 |
|---|---|---|
| `insight-daily(护栏阻断)` | 生成产物撞阻断型护栏(schema/禁词/数字),未进审 | 07:45 会自动补跑;连续阻断 → 查 prompt 或当日简报数据是否异常 |
| `insight-daily(生成)` 报错 | LLM/DB 异常 | 看 Vercel 日志;`force=1` 手动重跑 |
| `❌ 链级每日推理缺失`(08:30 看门狗) | 主跑+补跑都没产出草稿 | `POST /api/admin/insight-daily?force=1` 手动补;查简报是否 0 条 |
| 同图谱连续告警 | 连续 3 天热力方向零变化(§7.2-6) | 排查是否退化成预制图谱;连续 3 天未处理管线自动暂停,需人工确认后恢复 |

## 护栏语义(排障参考)
- **阻断型**(blockers 非空 = 弃 + 告警,不进审):schema 校验失败 / 禁词命中 / 具体涨跌数字(只扫我们生成的散文,不扫 references 外部标题)/ 生成侧 confidence=高。
- **警告型**(warnings = 进审,审核页标黄):references 全部不可达。
- **relation 只读红线**:heat/mappings 的关系分级只能来自 CHAIN_EDGES / insight 核定数据,LLM 与审核页均不可改;要改去改 `src/data/chainEdges.ts` 或 insight mappings。
- **confidence「高」**:只有审核页能给,生成侧写死封顶「中」。

## 页面读取优先级(排"为什么页面没更新")
当日 published daily → chain-take(07:01 生成)→ 规则兜底。
- 页面还是旧内容:①草稿是否已「发布」(draft 不上页)②ISR 未过 60s(等一会/看 publishedAt)③getPublishedDaily 取 status=published 且 date=今天。
- insight 详情页是 SSG+ISR,首次发布后最长 ~60s 才反映。

## 数据形态
- 表 `insight_docs`:slug 唯一(`daily-ai-YYYY-MM-DD`[-rN]),status=draft|published|rejected|superseded,payload=DailyInsightPayload。
- 生成成本(guard.detail):每篇约 LLM 2 次(判断+热力)+ 检索 0~2 次;S3 映射/S4 风险纯规则不打模型。

## 关掉/回滚
- 停自动生成:vercel.json 去掉 `/api/cron/insight-daily` cron。
- 页面回落地板:无需操作——没有 published daily 时页面自动走 chain-take/规则。
- 彻底回滚:代码层删 `src/lib/insight-pipeline/*` + 页面消费的 getPublishedDaily 调用;表可留(不影响)。
