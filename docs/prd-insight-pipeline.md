# PRD · insight 真实数据生产管线(M1 执行稿)

> 状态:**已拍板,直接进入 M1**(负责人 2026-07-03:战略方向通过,补齐 schema/审核页/风控红线/验收标准后开工)。
> 北极星:先证明 StockTell 每天真的能"Tell",再优化 Tell 得漂不漂亮。M1 唯一目标 = 连续稳定的每日产出,不是漂亮的产出。
> 设计背景与形态论证见 `docs/insight-pipeline-design.md`;本文是工程执行契约。

## 1. 背景与目标

当前每天已自动产出:8 条四段式事件推理 + 链级今日判断(chain-take)——这是"每天能 Tell"的地板。
管线的目标是把 Tell 变厚:**每个交易日自动生产结构化的「链级每日推理」**(热力方向/映射变化/验证点/真实 references),经人审后上线,并为 M2 事件专篇、M3 复盘回写打好底座。

**目标(M1)**:每个交易日 07:15 前,AI 链的每日推理草稿自动生成、通过四道护栏、飞书通知待审;人审后发布,首页因果链卡/链页/详情页今日区读库渲染。
**非目标(M1 不做)**:事件专篇(M2);多链(M1.5);复盘回写与抽审(M3);任何 UI 精修;每日推理的邮件/推送分发。

## 2. 已拍板决策(不再讨论)

| # | 决策 | 内容 |
|---|---|---|
| D1 | 产出物形态 | 链级每日推理(daily)为主 + 事件专篇(event)按触发,不做逐事件成篇 |
| D2 | M1 人审档位 | 全审:每篇 daily 必须人工发布,预计每天 2-5 分钟 |
| D3 | 事件专篇触发线 | \|隔夜\|≥5% 或同链 ≥3 触发共振(M2 生效,数值配置化) |
| D4 | M1 范围 | 只跑 ai 一条链;M1.5 接数据中心电力链、AI 应用链(链配置化,加链零工程) |
| D5 | 人审超时 | **降级发布**:地板内容(事件条目+chain-take)照常自动上线,完整每日推理等人审后"加厚"替换;不设超时自动发布。M3 抽审达标后经 `INSIGHT_AUTOPUBLISH` 开关再议 |

## 3. 产出物定义

### 3.1 链级每日推理(daily)
每链每交易日一份。固定骨架、内容每日生成:

- 今日触发(哪些隔夜事件、方向)
- 今日判断(链级人话判断,chain-take 的升级替代)
- 环节热力(每环节:方向/映射层级/一句话原因)
- 今日映射变化(被点名标的:环节/映射层级/今天为什么被提到/验证点)
- 今日一句话风险(方向化)
- references(真实来源,标注支撑哪部分)

### 3.2 事件专篇(event,M2)
完整 ReasoningChain,复用 `src/data/insight-chains.ts` 的 `InsightChain` 结构(1.0 模板已定稿),生成侧补 `generated: true` 与触发事件元信息。本 PRD 定義引用关系,实现在 M2。

## 4. Schema(M1 建表即按此)

### 4.1 Prisma 模型(走 /api/admin/init-db 惯例建表)

```prisma
model InsightDoc {
  id          String    @id @default(uuid())
  slug        String    @unique // daily-{chainId}-{date} | evt-{date}-{triggerCode}
  chainId     String    @map("chain_id")
  date        String    // YYYY-MM-DD(北京)
  kind        String    // daily | event
  status      String    @default("draft") // draft | published | rejected
  payload     Json      // §4.2 DailyInsightPayload(kind=daily)/ InsightChain 子集(kind=event)
  guard       Json?     // 护栏结果明细 {schema, bannedWords, numbers, urls, sameHeatmapDays},审核页展示
  reviewNote  String?   @map("review_note") // 打回原因/审核备注
  reviewedAt  DateTime? @map("reviewed_at")
  publishedAt DateTime? @map("published_at")
  createdAt   DateTime  @default(now()) @map("created_at")
  updatedAt   DateTime  @updatedAt @map("updated_at")

  @@index([date, status])
  @@index([chainId, date, kind])
  @@map("insight_docs")
}
```

### 4.2 DailyInsightPayload(TS 类型 = 校验 schema,单一来源 `src/lib/insight-pipeline/schema.ts`)

```ts
interface DailyInsightPayload {
  version: 1;
  chainId: string;
  date: string;
  trigger: {
    summary: string; // 「泛林、迈威尔、相干 等隔夜集体走弱」
    events: { code: string; name: string; direction: "up" | "down"; magnitude: "大" | "中" }[];
  };
  judgment: string; // 链级今日判断,60~140字,人话
  heat: {
    segment: string;               // 必须 ∈ 链配置 segments 枚举
    direction: "升温" | "降温" | "分化" | "观察";
    relation: "直接映射" | "间接映射" | "情绪映射";
    reason: string;                // 一句话,≤60字
  }[];                             // 每环节一行,环节全集来自链配置
  mappingsDelta: {
    code: string; name: string; segment: string;
    relation: "直接映射" | "间接映射" | "情绪映射" | "弱映射";
    todayWhy: string;              // 今天为什么被提到(≤60字)
    verify: string[];              // 1~3 个验证点(环节模板起步,LLM 可细化)
  }[];
  risk: string;                    // 今日一句话风险(方向化)
  references: {
    name: string; url: string; date?: string;
    supports: string;              // 支撑哪个环节/哪个判断
    kind: "具体来源" | "常设入口";
    verified: boolean;             // URL HEAD 实测结果
  }[];
  confidence: "中" | "低";         // 生成侧封顶「中」;「高」只能人审给(审核页字段)
}
```

### 4.3 链配置扩展(`src/data/chains.ts`)

`ChainConfig` 新增 `segments`,同时落地拍板⑨的验证点模板(P1 自选闭环复用同一份):

```ts
segments: {
  name: string;            // "光模块/高速互连"
  plain: string;           // 人话:「数据中心里机器间高速传数据的'光接头'」
  defaultRelation: "直接映射" | "间接映射" | "情绪映射";
  verifyTemplate: string[]; // 如 ["800G/1.6T 订单", "海外云厂资本开支", "毛利率"]
}[]
```

AI 链首版环节(与 ai-infra insight 热力对齐):光模块/高速互连、存储/HBM、先进封装/封测、液冷/温控、数据中心电力、服务器/算力代工、铜连接/高速互连(铜)、国产算力芯片。

### 4.4 LLM 生成分段(每段独立调用 + schema 校验,失败重试 1 次)

| 段 | 输入 | 输出 | 说明 |
|---|---|---|---|
| S1 判断+触发 | 当日 items + 链配置 | trigger.summary + judgment | chain-take prompt 升级版 |
| S2 环节热力 | items + segments 枚举 + **昨日 heat**(diff 用) | heat[] | 枚举外环节名=校验失败 |
| S3 映射变化 | items.beneficiaries + CHAIN_EDGES 关系 + verifyTemplate | mappingsDelta[] | relation 由 CHAIN_EDGES/insight 核定数据给,LLM 只写 todayWhy/细化 verify,**不允许 LLM 改 relation** |
| S4 风险 | 方向统计 | risk | M1 规则模板方向化(已上线的 dailyRisk),不打 LLM |
| S5 references | 触发标的 | references[] | 非 LLM:博查检索 top 来源 + 常设入口集合;URL 实测 |

## 5. 管线编排

- **独立 cron `GET /api/cron/insight-daily`(07:05 北京,CRON_SECRET)**:不挤 07:01 主流程的 300s 预算。流程:读当日 published items → 逐链生成(M1 仅 ai)→ 护栏 → 落库 draft → 飞书卡片。幂等:当日该链已有 draft/published 则跳过(`?force=1` 重生成)。
- **07:40 backup(并入 briefing-backup)**:幂等补跑(主 cron 漏触发/生成失败时)。
- **08:30 watchdog 并入现有看门狗**:交易日无当日 daily(draft 或 published)→ ❌ 飞书告警。
- **手动端点**:`POST /api/admin/insight-daily?date=&chain=&force=1`(重生成,复用管线函数)。
- 与 replace 的联动:`briefing/generate?replace=1` 重生成条目后,自动 force 重生成当日 daily draft(已发布的降回 draft?**不**——已发布的保持在线,新 draft 生成后由人审决定是否替换发布)。

## 6. 审核页(/admin/insights)

- **守卫**:页面级 `requireAdmin()`(同现有 admin);接口 `isAdminAuthorized || isAdminSession`。
- **列表**:日期倒序;draft 置顶;每行 = date / 链 / kind / 护栏状态灯(全绿 or N 项警告) / 生成时间 / 状态。
- **详情编辑**(字段级):
  - judgment、risk:textarea 直接改
  - heat:每行 direction/relation 下拉 + reason 输入
  - mappingsDelta:todayWhy/verify 可改,relation 只读(数据来自核定关系,页面不许改——要改去改 CHAIN_EDGES/insight 核定数据)
  - references:可删行、可改 supports;**手填 URL 允许但保存时跑可达性实测**,不可达标红
  - confidence:下拉 低/中/高(「高」只有这里能给)
- **动作**:`发布`(status=published,盖 publishedAt;页面 ISR 60s 内生效)/ `打回`(reviewNote 必填,status=rejected)/ `重新生成`(force 调管线,旧 draft 覆盖)。
- **飞书卡片**(生成完成即推):`📋 {date} AI链每日推理待审 · 护栏 {全过|N 项警告} · 判断预览(前 40 字) · 审核链接`。打回/发布不再推(避免噪音);08:30 看门狗兜底催审。

## 7. 风控红线

### 7.1 自动护栏(任一不过 = 不进审核队列,弃 + 飞书告警)
1. schema 校验(4.2 类型逐字段;枚举外值、缺段、超长即失败;重试 1 次)
2. 禁词 lint:首页 PRD §9.2 全清单 + 盘面词全集(接/冲/追/低吸/低开/高开/企稳/放量*/缩量/破位/补跌/超跌反弹/出货*/站岗/错杀/获利盘/洗盘/值得多看一眼;*号词按产业语义白名单放行:「出货量」「放量节奏」等指标用法)
3. 具体涨跌数字红线(`hasSpecificMove` 复用)
4. references URL HEAD 实测,不可达即剔除该条;全部不可达 → 警告标记(可进审,审核页标红)

### 7.2 永不自动化的红线(写死,配置不可绕过)
1. 任何产出不得含买卖指令/目标价/涨跌预测(三铁律 3)——禁词 lint 是手段,人审是最终责任人
2. confidence=「高」只能人审授予,生成侧写死封顶「中」
3. mappingsDelta.relation 只能来自核定数据(CHAIN_EDGES/insight mappings),LLM 与审核页均不可改
4. references 的 URL 只能来自检索结果或人工录入+实测,生成器**永不**自产 URL
5. 事件专篇(M2)永远全审,不适用降级发布
6. 同图谱检测:连续 3 天 heat 方向零变化 → 告警;告警连续 3 天未处理 → **管线自动暂停**(fail-closed,飞书通知),防止退化成预制图谱
7. 复盘回写(M3)只写事实数字,不回改判断文本

### 7.3 降级与可靠性(拍板 D5)
- 人审未完成:页面照常显示地板内容(事件条目 + chain-take + 规则 risk),**不空窗、不显示未审草稿**
- 生成失败/护栏全弃:飞书告警 + 07:40 兜底补跑;当天最终无 daily → 看门狗 ❌,页面维持地板
- 页面读取优先级:当日 published daily → chain-take → 规则兜底(现有链路不动,daily 是"加厚层")

## 8. 页面消费(M1 范围)

- 首页因果链卡:judgment/risk/trigger 优先读当日 published daily;heat 前 3 强环节可替换三层静态行(有 daily 时)
- 链页「今天怎么看这条链」:同源替换
- insight 详情页(/insight/ai-infra):顶部加「今日更新」区(judgment + heat 摘要 + 日期),正文骨架不动
- 均为服务端读库(ISR 保持),无客户端新请求

## 9. 观测与指标

- 管线事件全走飞书:生成成功(耗时/护栏明细)/失败/待审提醒/暂停告警
- 每日记录(guard json 内):LLM 调用次数、检索次数、重试次数——成本可回溯
- 产品侧沿用 home_reasoning_card_* 埋点;详情页「今日更新」曝光后续 P2 一并埋

## 10. 验收标准

### 10.1 M1 功能验收(开发完成即验)
- [ ] init-db 建表成功,slug 唯一约束生效
- [ ] 07:05 cron 生成 ai 链 daily draft(手动 force 端点同效)
- [ ] 四道护栏各有单测样例:坏 schema/禁词/数字/死链均被拦截且飞书可见
- [ ] 飞书卡片可点直达审核页;改字段/发布/打回/重新生成全流程可用
- [ ] 发布后首页卡、链页、详情页今日区 90s 内(ISR)渲染新内容
- [ ] 未审时三处页面显示地板内容,无空窗、无草稿泄漏
- [ ] smoke.sh 增补:管线幂等 + 未授权访问审核接口 401

### 10.2 M1 运行验收(北极星,连续 10 个交易日)
- 草稿就绪率 100%(每交易日 08:00 前 draft 存在;补跑后达成也算)
- 人审发布率 ≥80%(允许你有事的天数走降级)
- 护栏误杀 ≤10%(被弃产物人工复核属"该弃")
- 断更 0 天(地板保证:任一天页面都有可看的 Tell)
- 人审修改率(编辑距离占比)按周记录——M3 抽审门槛(<20% 连续 2 周)的基线数据

### 10.3 内容抽验(负责人,每周一次)
- 随机抽 2 天:judgment 与当日事实一致;relation 与核定数据一致;references 可达且 supports 对得上;无禁词
- 「两类不同事件产出同一张热力图」= 直接不通过(内核红线)

## 11. 排期

- **M1-D1**:schema.ts + Prisma 模型 + init-db + lib/insight-pipeline(S1-S5 生成+护栏)+ cron/手动端点
- **M1-D2**:/admin/insights 审核页 + 飞书卡片 + 页面消费(首页卡/链页/详情页今日区读库)
- **M1-D3**:联调 + 首次真实生成→你审→上线 + smoke 用例 + runbook(排障:重生成/补跑/暂停恢复)
- **M1.5**:电力链、AI 应用链接入(先人工精修各自骨架 insight=详情页内容,过你评审;之后每日由管线刷新)
- **M2**:事件专篇 + references 自动绑定强化;**M3**:复盘回写 + 抽审模式

## 12. 风险与开口

- LLM 输出稳定性:分段+校验+重试已兜;若某段失败率高,该段降级为规则模板(S4 已是)
- 博查检索质量:来源不相关时 references 会偏"常设入口"——M1 接受,M2 优化检索词
- 300s/cron 配额:独立 cron 已规避;Vercel cron 数量 +1(Pro 配额内)
- 审核负担:每天 2-5 分钟;若成负担,提前启动 M3 抽审评估

---

## 13. 开工前增补(负责人 2026-07-03 批准 PRD 时补充,已采纳)

1. **D3 触发条件扩充**:事件专篇触发 = |隔夜|≥5% 或 同链≥3 触发共振 **或 财报/指引/CapEx/订单/监管类事件 或 人工强制(admin force)**。
2. **status 增加 `superseded`**:同一 (chainId, date, kind) 任意时刻至多一个 published——发布新版本时旧 published 自动置 superseded;读取只认 published。
3. **confidence schema 三档全支持**(低/中/高),生成侧写死封顶「中」(护栏阻断生成产物出现「高」),「高」仅审核页可给。
4. **护栏分级**:阻断型(schema 校验/禁词/涨跌数字/生成侧 confidence=高)= 弃+告警不进审;警告型(references 全不可达/同图谱连续告警)= 进审但审核页与飞书标警告。
5. **弱映射内部化**:payload/DB 保留四档(直接/间接/情绪/弱),**前台一律三档**——「弱」渲染归并入「情绪映射」;insight 页"弱关联"分组并入情绪映射组。
