# Pipeline Replay Harness(回放测试)

> 2026-07-05 负责人拍板:**用历史真实数据回放替代等真实交易日。真实交易日只做生产 canary 确认,不做第一次验证。**
> 2026-07-06 负责人拍板补充:**Case C 口径正式确认 fallback ≠ failed**(见 §状态口径),snapshot 按此输出;
> CI 分层实挂:compliance-block 进 PR blocking,full / market-closed 进 nightly。

## 用法

```bash
pnpm pipeline:replay --date=2026-07-02 --mode=full                # Case C 兜底路径(默认 llm=off)
pnpm pipeline:replay --date=2026-07-02 --mode=full --llm=on       # Case A' 全真彩排(真 LLM+博查,花钱)
pnpm pipeline:replay --date=2026-07-06 --mode=market-closed       # Case B 美股休市
pnpm pipeline:replay --date=2026-07-02 --mode=compliance-block    # Case D 合规阻断注入(零网络,PR 门禁)
```

- `--date`:回放的业务日期(北京简报日)。
- `--mode`:`full`(正常链路)/ `market-closed`(休市断言)/ `compliance-block`(禁词 fixture 注入)。
- `--llm`:默认 `off` = 进程内摘除 LLM/博查 key → 走规则兜底(快、免费、确定性),**即 Case C 兜底口径,
  status=fallback**;`on` = 真 LLM 路径(Case A',status=generated)。llm=off 同时置 `INSIGHT_SKIP_URL_VERIFY=1`
  跳过 references 的 HEAD 可达探测(零网络、确定性;refs 保持 verified=false 不出伪验证)。
- 退出码:断言全过=0,任一失败=1(已挂 CI)。dry-run 是结构性的(脚本不 import 写库/发布层),`--dry-run` 标志仅作显式声明。

## 覆盖链路

真回放 `findMovers → generateDrafts → briefStatus 判定 → generateDailyInsight → runGuards`:

- **历史行情**:东财历史日 K(`us-history.usDailyBars`),取「北京 date 日 07:00 能看到的最新美股收盘」;
  `ReplayEnv`(行情快照 + 回放日 07:00 锚点)注入 `generateDrafts`,不走实时源。
- **休市判定**:`mostRecentUSWeekday` 锚点换成回放日,与历史 bar 新鲜度比对 → 真数据复现 `market_closed`。
- **insight**:`generateDailyInsight` 的 `itemsOverride` 内存直灌简报条目,不读写 DB。
- **dry-run 是结构性的**:脚本只调 `generateDrafts` / `generateDailyInsight`,两者本身不写库不发布
  (写库/发布在 cron route 层,脚本不 import)。回放路径同时**不发飞书告警**(探针告警被 `!replay` 挡住)。

每次输出 JSON snapshot(marketStatus / briefStatus / engine / eventCount / insightCount / relationsChecked /
relationParity / sourceLeakage / compliance / assertions / verdict),发结果只贴 snapshot 不贴日志。

## 固定样本矩阵(2026-07-05 首跑全绿;2026-07-06 Case C 口径固化后复跑全绿)

| Case | 命令 | 验收 | 结果 |
|---|---|---|---|
| A' 全真彩排 | `--date=2026-07-02 --mode=full --llm=on` | engine=llm / status=generated / confidence=中 | ✅ |
| B 美股休市 | `--date=2026-07-06 --mode=market-closed` | usMarketClosed / count=0 / status=market_closed 非 failed / 不硬造 insight | ✅ 真数据复现(07-03 独立日休市) |
| C LLM 失败→兜底 | `--date=2026-07-02 --mode=full`(默认 llm=off) | count>0 / engine=template / **status=fallback(非 failed)** / confidence=低 / insight≥1 未阻断 | ✅ |
| D 合规阻断 | `--mode=compliance-block` | 禁词 fixture 走真实全链路被 guard 拦,**status=blocked** + reason 可见 | ✅ 「禁词命中:满仓、抄底」 |
| E 关系冲突样本 | 每次都跑 | 英维克/金山/浪潮/中际旭创/Eaton/北方华创 8 项断言 | ✅ |

> 旧「Case A 正常交易日(llm=off)」与 Case C 是**同一命令**;2026-07-06 口径固化后统一按 C 断言
> (engine=template → status=fallback,不再断言 generated)。llm=on 的全真路径即 A'。

另每次附带:43 码关系标签新旧 parity(39 不变 + 4 处预期 P1-3 电力移出)、source-leakage=0 断言。

## 边界(诚实)

- 历史行情只有**日收盘价**(东财 250 根日 K),隔夜涨跌=相邻收盘差;盘中路径/实时源故障形态不在回放范围。
- **行情源限流/不可达 ≠ 管线错**:CI 跑机连续两轮全量拉东财会触发限流(2026-07-06 nightly 首跑实测
  第二步 71/71 全 miss → 空 quotes 被误判 open+failed;60s 间隔仍不够)。harness 对策:①market-closed
  只取 12 票探针集(休市判定是日历级,全美股同日历,不需要全池)②部分 miss 串行重试一轮 ③miss>50%
  直接报 `verdict=DATA_UNAVAILABLE`(exit 1,红但原因可读,不拿空数据断言休市语义)④nightly 两步隔 60s。
- `--llm=on` 的博查检索返回的是**当下**的网页结果,不是历史当日的——references 环节非严格历史回放。
- A 股 peers 的装饰性涨跌(`peers[].change`)回放中为 null(不影响条目生成与合规扫描)。
- 假期累计路径(`usCumulativeChange`)本身就按日期区间算,历史回放天然兼容,未单独出样本日。

## 状态口径(status taxonomy)

> **负责人 2026-07-06 正式确认,写死到本文档与 replay snapshot:不得把 LLM 挂等同于 failed。**
> - LLM 失败,但模板兜底成功:`fallback` / engine=template / confidence=low / 进入人工审;
> - 只有行情源、数据底座、结构性异常导致无法产出:`failed`;
> - 合规命中:`blocked`;
> - 美股休市:`market_closed`。

回放和生产使用同一套状态口径,避免把「休市」「兜底」「失败」混成一类。

| 状态 | 含义 | 是否事故 | 是否可发布 | 处理 |
|---|---|---:|---:|---|
| `generated` | LLM 全真产出简报/insight | 否 | 可进入 review/publish | 常规流程 |
| `market_closed` | 美股真实休市或最近有效美股 bar 陈旧,无新隔夜映射 | 否 | 不硬造新简报;可展示回退/状态说明 | 历史简报留状态记录 |
| `fallback` | LLM/博查不可用,规则模板兜底成功 | 否,但需关注 | 进入人工 review,默认低置信 | 标记 `engine=template`, `confidence=low` |
| `blocked` | 合规 guard 命中 HIGH/禁词等阻断项 | 否,属于正确阻断 | 不自动发布 | 显示 blocked reason,人工处理 |
| `failed` | 行情源/数据结构/兜底链路等地板故障导致无法产出 | 是 | 不发布 | 告警 + 人工排查 |

关键口径:

- LLM 失败 ≠ `failed`;只要模板兜底成功,就是 `fallback` / `engine=template` / `confidence=low`。
- `market_closed` ≠ `failed`;真休市不补发、不硬造内容。
- `blocked` 是合规正确行为,不是生成器失败。
- 只有行情源不可用、数据结构异常、兜底也失败等地板故障,才算 `failed`。

> 对齐备注:运行时 `src/lib/brief-status.ts` 的 `fallback` 徽章现语义=「首页展示回退内容」;生产状态里
> 引擎兜底(engine=template)的标注与本口径的对齐属 2.1,replay snapshot 已按新口径先行输出。

## CI / 发布门禁(2026-07-06 起实挂,不再是建议)

### PR / push blocking(`.github/workflows/relations-check.yml`)

```bash
npm run check:relation-lint
npm run check:resolver-samples
npm run check:resolver-health
npm run check:source-leakage -- --blocking
npx tsx scripts/pipeline-replay.ts --date=2026-07-02 --mode=compliance-block --llm=off
```

compliance-block 进 PR blocking 的前提(已满足):**零网络**(llm=off 摘 LLM/博查 key +
`INSIGHT_SKIP_URL_VERIFY=1` 免 HEAD 探测)、**零 DB**(无 `POSTGRES_PRISMA_URL` 时 `getPrisma()` 返 null)、
**秒级**、verdict!=PASS 即 exit 1。

blocking 条件:

- snapshot `verdict !== "PASS"`;
- `sourceLeakage !== 0`;
- relation sample 任一失败;
- `market_closed` 被误报成 `failed`;
- compliance fixture 未被阻断(status 必须=blocked);
- direct 缺 evidence / unknown segment(relation-lint 覆盖)。

### nightly(`.github/workflows/replay-nightly.yml`,每日 + 可手动触发)

```bash
npx tsx scripts/pipeline-replay.ts --date=2026-07-02 --mode=full --llm=off          # Case C 兜底
npx tsx scripts/pipeline-replay.ts --date=2026-07-06 --mode=market-closed --llm=off # Case B 休市
```

full / market-closed 依赖东财历史日 K(网络),不进 PR blocking 防 flaky;样本日在 250 根日 K 窗口内
有效约一年,**行情 fixture 落档(2.1)后再升 PR blocking**。

### 可选(花钱,手动/低频)

```bash
pnpm pipeline:replay --date=2026-07-02 --mode=full --llm=on
```

原因:`--llm=on` 会产生真实 LLM/博查调用,成本和外部波动都更高,不建议每个 PR blocking。

### 生产 canary

真实交易日 cron 跑完后,只做生产确认,不是第一次验证:

- 简报/insight 正常生成;
- admin 审阅关系与前台一致;
- source-leakage CI 仍为 0;
- dailyRelationSignals 不污染 staticRelations;
- resolver-health 基线无异常漂移。

## 必须长期守住的不变量

1. **单一读入口**:前台和生成链路的产业链关系主读入口必须是 `relationResolver`。旧 `relations.ts / edgeInfo / chainEdges` 只能作为显式 fallback,且必须打 warning。
2. **跨链不串档**:有 chain context 时,必须先按当前 chain 过滤;无 context 时展示多链关系,不能跨链取最强档覆盖展示。
3. **daily 不改 static**:`dailyRelationSignals` 只影响今日触发/热度,不能自动 promote/downgrade `staticRelations`。
4. **history 不改 relationType**:历史同向统计不能反向改关系档;调档必须进入 `relationReviewQueue` 人工审。
5. **note 不外泄**:审阅 note 只用于审计,不得作为前台 reason 展示。
6. **remove 必须落地**:已从某 chain remove 的股票,不得被旧源或 fallback 捞回该 chain。
7. **休市不硬造**:`market_closed` 时可以展示回退内容/状态说明,但不能伪造新隔夜映射。
8. **LLM 挂 ≠ failed**:模板兜底成功即 `fallback`(engine=template/confidence=low/进入人工审);
   `failed` 只给地板故障。

## 关键关系样本断言

每次 replay 都应至少覆盖下列样本,防止 P1-2/P1-3 回归:

| 样本 | 期望 |
|---|---|
| 中际旭创 `300308` | `ai-infra` / 光模块或高速互连 / `direct` |
| 浪潮信息 `000977` | `ai-infra` / AI 服务器 / `direct` |
| 英维克 `002837` | `data-center-power` / 温控或液冷 / `direct` |
| 英维克 `002837` | 不得出现在 `ai-infra` 静态关系中 |
| 金山办公 `688111` | AI 应用侧 / `indirect`,验证商业化收入,不挂 `ai-infra` |
| Eaton `ETN` | `data-center-power` 触发源 |
| 北方华创 `002371` | 不得被 `ai-infra` 旧源捞回;如展示则为待验证/候选口径 |
| 旧源直读 | `sourceLeakage = 0` |

## 失败排查顺序

当 replay 或 canary 失败时,按以下顺序定位,避免盲改:

1. **market calendar / asOf**:确认是否真实休市、半日市、bar 陈旧。
2. **行情源**:确认 `findMovers` 是否拿到事件;是否为空但非休市。
3. **resolver**:确认 chain context、segment、relationType、remove 是否正确。
4. **generate**:确认 draft items 是否进入 `generateDailyInsight`。
5. **compliance guard**:确认是否被 HIGH/禁词正确阻断。
6. **admin / review**:确认待审内容和前台展示是否一致。
7. **publish 层**:确认是否只是发布/缓存问题,而非生成问题。

原则:先看 snapshot,再看日志;先定位是哪一层,再改代码。

## 与 2.1 的边界

本 harness 只解决「2.0 收尾验证」,不解决所有内容增强。

属于 2.0 收尾:

- 正常交易日回放;
- 美股休市状态记录;
- LLM 兜底验证;
- 合规阻断验证;
- resolver 关系样本断言;
- source-leakage blocking。

属于 2.1 增强:

- 节后首个 A 股交易日简报模式;
- 周末消息聚合进节后简报;
- 更完整的半日市/跨多日累计样本矩阵;
- 严格历史网页 references 回放;
- 历史行情 fixture 落档(full / market-closed 升 PR blocking 的前提);
- 生产 brief-status 的引擎兜底标注与本口径对齐;
- 更细的行业链扩展和 SEO 归档。
