# StockTell 可信推理、情境追问与 Pro 意向 PRD

> 状态：待产品评审  
> 版本：v2（按 2026-07-11 `stocktell2.0@8f057ab` 代码重写）  
> 本期边界：不做正式订阅、支付、付费墙、用户自带模型或 API Key。

## 1. 结论

本期要跑通的不是“文章底部加链接 + 接一个聊天框”，而是：

`今日判断 → 就近看依据 → 对某一步继续追问 → 表达需要哪种进阶能力`

优先级：

1. **P0：把现有 References 从页底搬到它所支撑的判断旁边。**
2. **P0：新增“数据来源与方法”页，按当前真实代码说明数据源、更新频率和推理过程。**
3. **P1：在推理链详情页做受限的情境式追问，不做通用股票聊天。**
4. **P1：升级已有 `/pro` 意向收集，只验证能力需求，不验证价格与支付。**

## 2. 当前代码基线

以下是本 PRD 的事实底座，不再沿用旧文档假设。

### 2.1 已有产品能力

- 首页已经是“今日最重要的因果链”，入口落到 `/insight/[slug]`。
- 已上线 AI 推理基础设施、数据中心电力、半导体设备与先进制程三条主链；AI 应用作为深化 insight。
- `/insight/[slug]` 同时展示静态推理骨架和当日已发布 `InsightDoc`。
- `/insight/[slug]/[date]` 已形成每日推理归档，并展示当日 References。
- `InsightDoc` 已有 draft / published / rejected / superseded 生命周期，当前管线是自动生成、护栏检查、自动发布、事后审阅。
- 长期产业链关系已经统一到 `StockChainRelation` / `relationResolver`，direct 与 indirect 关系已带法定披露入口、验证点和证据状态。
- 已有 `/relations` 公开解释关系分级；已有 `/pro` 占位页、意向按钮、feedback 落库、Umami 埋点和后台计数。
- 已有登录后可用的流式“StockTell 解读”，覆盖简报、个股、早报和资金面，但它是一次性生成，不是多轮对话。

### 2.2 当前 References 实际有三套

| 层 | 当前结构 | 当前展示 | 主要缺口 |
|---|---|---|---|
| 静态推理骨架 | `InsightChain.references`，用自由文本 `supports` 说明支撑哪一跳 | `/insight/[slug]` 页底折叠 | 来源离判断太远；无法稳定机器绑定到 hop/heat/mapping |
| 每日链级判断 | `DailyInsightPayload.references`，包含 `supports/kind/verified` | 当日归档页底部；最新页只展示 judgment/heat/risk，不展示当日引用 | 用户在最新判断旁看不到当天依据；没有证据强度与事实/推理角色 |
| 长期股票关系 | `StockChainRelation.references`、`verificationPoints`、`evidenceStatus` | 部分股票页/关系页可见，direct/indirect 有审核门槛 | 与 insight 引用结构不同；常设披露入口容易被误解成“已证明具体结论” |

因此本期不能直接创造第四套 Reference。先统一展示语义，再渐进统一结构。

### 2.3 当前数据与模型能力

- 实时个股行情：腾讯为主源，新浪补缺；两者失败后使用数据库行情缓存。
- 美股指数：Yahoo 为主，新浪/腾讯补缺。
- 交易日历、基本面、资金面、雷区、财报和相似性：Tushare。
- 新闻与事件检索：博查；“为什么动”只在检索到可核实材料时生成原因。
- LLM：ModelVerse 主、DeepSeek 官方兜底；运行时由后台人工切换，已有耗时指标和劣化告警。
- 数据库：Vercel Postgres/Neon + Prisma；线上改表必须同步更新 `prisma/schema.prisma` 与 `/api/admin/init-db`。
- 分析：自托管 Umami；不得上传邮箱、原始问题、回答正文或持仓等敏感信息。

注意：`docs/EXTERNAL_SERVICES.md` 的速查内容部分滞后，例如行情仍写新浪；`/methodology` 发布内容必须以运行代码为准，并同步修正文档。

### 2.4 不能直接复用的旧能力

`/api/briefing/explain` 的旧提示词包含“机会还是陷阱、超跌、企稳、低开、放量、该盯什么信号”等交易/择时语义，且：

- 只做一次性解读，没有逐轮意图检查和话题重锚。
- 缓存存最终长文，没有消息级来源绑定。
- 输出过滤不满足新对话的红线要求。
- 当前进程内限流不能在多实例下承担用户对话额度。

新对话可以复用 LLM provider、流式传输、指标和错误降级模式，但不能复用旧 system prompt 或把旧接口直接扩成多轮聊天。

## 3. P0：References 就近可见

### 3.1 用户目标

用户在看到一句话判断、某一跳、某个热力方向或股票映射时，不离开当前上下文就能回答：

- 这是外部事实，还是 StockTell 的推理？
- 哪条来源支撑它？
- 来源是具体材料还是“去哪核实”的常设入口？
- 这一步证据够不够，哪里仍是假设？

### 3.2 首版改造范围

首版只改两个核心页面：

1. `/insight/[slug]`：静态骨架 + 最新 published daily。
2. `/insight/[slug]/[date]`：每日归档。

暂不把全站股票页、链页、首页卡片同时重构，避免一次改动四套页面。首页保持结论入口，用户进入 insight 后核实。

### 3.3 页面设计

在以下位置增加紧凑入口：

- 今日判断与今日风险下方：“今日依据 N 条”。
- 每个主 hop：“依据 N 条 / 推理假设”。
- 每个 heat 行：“为什么这样判断”。
- mapping 关系说明：“关系依据 / 验证点”。

入口展开后显示统一证据卡：

| 字段 | 展示规则 |
|---|---|
| 来源名称 | 可访问时提供外链 |
| 来源类型 | 官方公告、财报、监管文件、公司 IR、行情、新闻、第三方研究、历史复盘 |
| 日期 | 具体材料展示发布日期；常设入口不伪造发布日期 |
| 支撑内容 | 一句话说明它支撑当前判断的哪部分 |
| 来源角色 | 事实来源 / StockTell 推理 / 推理假设 |
| 核实状态 | 已核实可达 / 常设核实入口 / 当前不可达 / 待验证 |
| 结论置信度 | 高 / 中 / 低；与链接是否可达分开表达 |

不新增“强/中/弱证据”字段作为首版硬数据，因为当前三套结构没有统一、可审核的评级标准。首版先诚实展示“来源角色 + 核实状态 + 结论置信度”；证据强度在 Reference v2 完成后再引入。

### 3.4 结构迁移策略

#### PR1：不改数据库的展示层收敛

- 新建共享 `EvidencePanel`，适配静态 `InsightChain.references`、daily references 和 `RelationReference`。
- 新建纯函数 `matchReferences(target, references)`：迁移期根据现有 `supports` 与 hop order/segment/code 做显式规则匹配。
- 匹配不到的引用留在“其他来源”，不能硬绑到某一步。
- 某判断没有引用时明确显示“推理假设 · 待验证”，不能用空白掩盖。

#### PR2：生产结构升级为 Reference v2

当前 `DailyInsightPayload.version=1` 已落在历史 `InsightDoc.payload` 中，不能原地破坏。新增兼容版本：

```ts
type ReferenceV2 = {
  id: string
  name: string
  url?: string
  sourceType: 'official' | 'filing' | 'regulatory' | 'market' | 'news' | 'research' | 'history'
  kind: 'specific' | 'standing_entry'
  publishedAt?: string
  checkedAt?: string
  verified: boolean
  role: 'fact' | 'reasoning' | 'hypothesis'
  supportsText: string
  targets: Array<{
    type: 'judgment' | 'risk' | 'hop' | 'heat' | 'mapping'
    id: string
  }>
}
```

- `DailyInsightPayload.version` 升为 2，新 loader 同时读取 v1/v2。
- 历史归档不批量伪迁移；v1 继续用兼容展示。
- 静态 `InsightChain` 的 hop/heat/mapping 补稳定 ID，逐条人工绑定 references。
- 长期 `RelationReference` 暂不强行改成同一 TypeScript 类型，由 adapter 统一展示；后续单独迁移。
- URL 继续只能来自博查结果或人工录入，经过 SSRF 防护后的可达性检查；模型不得自产 URL。

### 3.5 状态语义

- **具体来源 + verified**：链接已实测可达，只代表材料真实存在，不代表 StockTell 的推论必然成立。
- **常设入口**：告诉用户去哪里查公司披露，不得标“已核实该结论”。
- **推理假设**：缺少直接来源，必须可见。
- **链接不可达**：保留名称、最近核实时间并标状态，不自动删除历史证据。
- **来源冲突**：并列显示，结论置信度下降，并指出冲突点。

## 4. P0：数据来源与方法 `/methodology`

### 4.1 页面职责

这是公开的产品说明页，不是把 `EXTERNAL_SERVICES.md` 原样暴露。它回答：数据来自哪里、多久更新、AI 做什么、人工做什么、怎么判断证据、哪里可能错。

### 4.2 页面内容

1. **一条推理如何形成**  
   事件/行情触发 → 归入产业链 → 生成链级判断与热力 → 按审核后的关系档映射 A 股 → 绑定来源 → 护栏检查 → 发布与复盘。
2. **实时行情**  
   腾讯主源、新浪补缺；美股指数 Yahoo 主源；失败时可能显示缓存，并以页面真实 `asOf` 为准。
3. **金融数据**  
   Tushare 提供交易日历、基本面、资金面、雷区、财报与相似性数据；各模块更新频率不同，不承诺全站实时。
4. **事件与新闻**  
   博查负责公开网页检索；搜不到可靠材料时，“为什么动”不生成原因。
5. **产业链关系**  
   `StockChainRelation` 是经人工校准的研究框架；direct/indirect/sentiment/weak/candidate/trigger 各自代表什么，并链接 `/relations`。
6. **AI 与人工**  
   LLM 负责归纳和候选推理；映射关系不由 LLM 临时决定；生成内容经过结构校验、禁词/数字护栏和发布规则，关系升级仍需人工评审。
7. **如何读 References**  
   区分具体来源、常设入口、事实、推理、假设、链接核实状态与结论置信度。
8. **更新时间与局限**  
   行情、盘前简报、每日 insight、周更静态数据分别说明节奏；历史归档保留当日判断，不随后市改写。
9. **产品边界**  
   不提供买卖、目标价、涨跌预测或仓位建议；关系是研究框架梳理·非确认，不构成投资建议。

### 4.3 入口与同步要求

- 页脚新增“数据与方法”。
- EvidencePanel 底部新增“这些标签是什么意思？”。
- `/relations` 增加返回方法页的交叉入口。
- 发布 `/methodology` 的同一 PR 必须同步更新 `docs/EXTERNAL_SERVICES.md` 的当前主/备数据源与最后更新时间，避免内外口径再次漂移。

## 5. P1：推理链情境式追问

### 5.1 产品形态

只在 `/insight/[slug]` 与每日归档页中出现，入口绑定一个明确锚点：

- 追问今日判断。
- 追问这一跳。
- 追问这个产业环节。
- 追问这只股票为什么被映射。
- 追问当前风险或证伪条件。

不提供首页空白框或全站悬浮聊天。桌面端使用右侧面板，移动端使用底部全屏抽屉；面板顶部始终显示当前链、日期和锚点。

### 5.2 推荐问题

- 这一步最关键的依据是什么？
- 哪个前提不成立时，这条链会断？
- 这是直接关系，还是市场情绪映射？
- 有什么相反证据或容易误判的地方？
- 我的自选里哪些和这一步有关？（登录且有自选时出现）

### 5.3 回答合同

每轮固定输出结构化 JSON，由前端渲染，不让模型自由决定版式：

```ts
type GroundedAnswer = {
  oneLiner: string
  explanation: string[]
  referenceIds: string[]
  uncertainty: string
  result: 'grounded' | 'no_evidence' | 'redirected'
}
```

回答顺序：一句话回答 → 最多三点解释 → 引用 → 不确定性。免责声明由应用层固定追加。

模型只能引用服务端提供的 reference ID。没有材料时返回 `no_evidence`，不得凭模型训练知识补成当前事实。

### 5.4 服务端上下文

服务端根据 slug/date/anchorId 自行装配，不信任客户端传入整段文章：

- 静态 `InsightChain`。
- 指定日期或最新 published `InsightDoc`。
- 当前链的 `StockChainRelation`、验证点和关系 References。
- 登录用户自选代码及已有关系；不传成本、仓位、交易记录。
- 当前对话最近 6 轮的结构化消息。

首版不开放实时网页搜索。否则新搜索结果与已审阅 References 很容易混淆；后续若开放，必须单列“本次检索，未经人工审阅”。

### 5.5 护栏

- 对话专用 system prompt，不复用 `/api/briefing/explain` 的 `SYS`。
- 每轮输入分类：买卖、涨跌预测、目标价、仓位、择时、无关话题均重定向。
- 每轮重新锚定当前链，防止第二轮开始滑向“那我该买吗”。
- 输出通过 `content-guard`，并补充预测断言、收益承诺和隐晦操作语测试集。
- 命中红线后，不建议“企稳、放量、开盘盯”等替代择时动作，只解释事实、关系强弱、验证条件和风险。
- 用户原问题不进入 Umami；服务端消息留存、隐私政策和删除机制在上线前确定。

### 5.6 配额、存储与可靠性

- 只向登录用户开放 MVP，减少匿名滥用和跨设备状态问题。
- 默认每用户每天 10 个问题、单次输入 300 字、单线程并发 1；以压测后成本预算为准。
- 配额必须使用 Postgres 原子计数或消息计数，不能使用现有进程内 `rate-limit.ts`。
- 新增 `ChatThread` / `ChatMessage`（或等价表）时，必须同时更新 Prisma schema、init-db 和启动哨兵。
- 最多发送最近 6 轮给模型；更早内容只保留服务器生成的结构摘要。
- 复用 `getLLMFor('fast')`、provider 切换、流式响应、`chatTimed/withMetrics` 与飞书告警。
- LLM 不可用时不回退到无来源模板答案，直接返回可重试状态。
- 功能有独立总开关；P95 延迟、错误率或护栏回归不合格时可以整体关闭。

## 6. P1：Pro 意向收集升级

### 6.1 当前问题

现有 `/pro` 已能登记“专业版意向/订阅意向”，但两个按钮只能证明用户点过，无法回答用户究竟想为什么能力付费。“订阅意向”文案也容易让人误解为即将收费。

### 6.2 新交互

页面继续明确：当前全部功能免费；本次只收集需求；不收费、不绑卡、不承诺时间。

用户最多选择 2 项：

- 自选股相关事件的深度追踪。
- 产业链每日变化提醒。
- 更长周期、按链拆分的历史复盘。
- 更多产业链覆盖。
- 个股验证点持续跟踪。
- 更多情境追问额度。
- 其他（最多 100 字）。

再选择一个主要使用场景：盘前看隔夜传导、盘中看懂异动、盘后复盘、研究自选与全球事件关系。

不询问价格，不展示“立即订阅”，不创建 plan 字段。

### 6.3 复用现有数据链路

- 继续使用 `/api/feedback`、Feedback 表、飞书通知和现有限流。
- 客户端提交 `choices/useCase/other`，服务端按白名单校验后序列化为稳定的 `pro_intent_v2` content；不允许客户端自由伪造 category。
- 后台 metrics 按稳定枚举聚合，保留已有 `pro_interest` 事件；废弃新增曝光后的 `subscribe_intent` 主指标，但历史数据不删除。
- localStorage 只做 30 天展示抑制，不作为真实去重；登录用户按最新一条意向统计。
- 完成一次证据展开或一次追问后才显示轻入口；不打断首屏、登录和对话过程。

## 7. 埋点

| 事件 | 属性 |
|---|---|
| `reference_open` | insight_id, date, target_type, target_id, reference_kind |
| `reference_external_click` | insight_id, reference_id, source_type |
| `methodology_view` | entry |
| `chat_open` | insight_id, date, anchor_type |
| `chat_question_submit` | insight_id, anchor_type, turn_no, intent_class |
| `chat_answer_result` | result, reference_count, latency_bucket, provider |
| `chat_quota_reached` | — |
| `pro_intent_view` | entry, trigger |
| `pro_intent_submit` | choice_1, choice_2, use_case, entry |

严禁上传用户原问题、回答正文、邮箱、持仓或自由输入内容。

## 8. 验收标准

### References / 方法页

- 最新页的今日 judgment 与 risk 能看到当日 References，不再只在归档页底部出现。
- 静态 hop、heat、mapping 有引用入口或明确的“推理假设/待验证”。
- 常设披露入口不显示成“已证明具体结论”。
- 历史 v1 payload 正常渲染；v2 不破坏已归档 URL。
- `/methodology` 所列数据源与当前代码一致，`EXTERNAL_SERVICES.md` 同步更新。
- 无任何模型自产 URL。

### 情境追问

- 客户端不能通过伪造 context/referenceId 让模型引用站外任意内容。
- 买卖、目标价、涨跌、仓位、择时以及连续诱导测试 100% 重定向。
- 每条 grounded 回答至少引用 1 个服务端允许的 reference ID；没有则为 `no_evidence`。
- 每轮应用层展示免责声明；流式中断也不能留下无状态裸答案。
- 配额在多实例并发下仍生效；功能开关可立即关闭入口。

### Pro 意向

- 全站不出现价格、支付、开通会员或正式订阅承诺。
- 能按候选能力与使用场景聚合，而不是只得到一个按钮点击数。
- Umami 不含自由文本和 PII。

## 9. 发布顺序

1. **PR1：References 展示收敛**  
   共享 EvidencePanel、三套 adapter、最新 daily 引用前移、无证据状态、埋点。
2. **PR2：方法页与文档校准**  
   `/methodology`、页脚/关系页入口、修正 `EXTERNAL_SERVICES.md`。
3. **PR3：Reference v2**  
   payload v1/v2 兼容、稳定 target ID、生产与审核页改造；历史内容不伪迁移。
4. **PR4：情境追问 MVP**  
   仅登录、小流量、只在 insight 页、服务端上下文、DB 配额、逐轮护栏和功能开关。
5. **PR5：Pro 意向 v2**  
   结构化能力选择、使用场景、深读后轻入口和后台聚合。

## 10. 本期明确不做

- 正式订阅、支付、定价实验、付费墙、会员 plan。
- 用户自带 Key、接任意模型、模型选择器。
- 全站通用聊天、选股、诊股、收益预测和交易建议。
- 对话实时联网搜索、文件上传、语音、图片、分享和长期记忆。
- 一次性重构所有股票页/链页 References。
- 把 References、方法透明、基础推理或风险说明变成未来付费权益。

