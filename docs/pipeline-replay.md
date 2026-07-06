# Pipeline Replay Harness(回放测试)

> 2026-07-05 负责人拍板:**用历史真实数据回放替代等真实交易日。真实交易日只做生产 canary 确认,不做第一次验证。**

## 用法

```bash
pnpm pipeline:replay --date=2026-07-02 --mode=full --dry-run             # Case A 正常美股交易日
pnpm pipeline:replay --date=2026-07-06 --mode=market-closed --dry-run    # Case B 美股休市
pnpm pipeline:replay --date=2026-07-02 --mode=compliance-block --dry-run # Case D 合规阻断注入
pnpm pipeline:replay --date=2026-07-02 --mode=full --llm=on --dry-run    # 全真彩排(真 LLM+博查,花钱)
```

- `--date`:回放的业务日期(北京简报日)。
- `--mode`:`full`(正常链路)/ `market-closed`(休市断言)/ `compliance-block`(禁词 fixture 注入)。
- `--llm`:默认 `off` = 进程内摘除 LLM/博查 key → 走规则兜底(快、免费、确定性);`on` = 真 LLM 路径。
- 退出码:断言全过=0,任一失败=1(可挂 CI)。

## 覆盖链路

真回放 `findMovers → generateDrafts → briefStatus 判定(镜像 cron)→ generateDailyInsight → runGuards`:

- **历史行情**:东财历史日 K(`us-history.usDailyBars`),取「北京 date 日 07:00 能看到的最新美股收盘」;
  `ReplayEnv`(行情快照 + 回放日 07:00 锚点)注入 `generateDrafts`,不走实时源。
- **休市判定**:`mostRecentUSWeekday` 锚点换成回放日,与历史 bar 新鲜度比对 → 真数据复现 `market_closed`。
- **insight**:`generateDailyInsight` 的 `itemsOverride` 内存直灌简报条目,不读写 DB。
- **dry-run 是结构性的**:脚本只调 `generateDrafts` / `generateDailyInsight`,两者本身不写库不发布
  (写库/发布在 cron route 层,脚本不 import)。回放路径同时**不发飞书告警**(探针告警被 `!replay` 挡住)。

每次输出 JSON snapshot(marketStatus / briefStatus / engine / eventCount / insightCount / relationsChecked /
relationParity / sourceLeakage / compliance / assertions / verdict),发结果只贴 snapshot 不贴日志。

## 固定样本矩阵(全部已跑绿,2026-07-05)

| Case | 命令 | 验收 | 结果 |
|---|---|---|---|
| A 正常交易日 | `--date=2026-07-02 --mode=full` | count>0 / insight≥1 未阻断 / status=generated | ✅ 8 条 / 2 insight |
| A' 全真彩排 | 同上 `--llm=on` | engine=llm / confidence=中 | ✅ |
| B 美股休市 | `--date=2026-07-06 --mode=market-closed` | usMarketClosed / count=0 / status=market_closed 非 failed / 不硬造 insight | ✅ 真数据复现(07-03 独立日休市) |
| C LLM 失败 | =`--llm=off` 的 full | **如实说明:管线设计=北极星每天必产出,LLM 挂→规则兜底(engine=template/confidence=低),不是 failed;failed 只给地板故障** | ✅ 兜底路径全绿 |
| D 合规阻断 | `--mode=compliance-block` | 禁词 fixture 走真实全链路被 guard 拦,blocked=true + reason 可见 | ✅ 「禁词命中:满仓、抄底」 |
| E 关系冲突样本 | 每次都跑 | 英维克/金山/浪潮/中际旭创/Eaton/北方华创 8 项断言 | ✅ |

另每次附带:43 码关系标签新旧 parity(39 不变 + 4 处预期 P1-3 电力移出)、source-leakage=0 断言。

## 边界(诚实)

- 历史行情只有**日收盘价**(东财 250 根日 K),隔夜涨跌=相邻收盘差;盘中路径/实时源故障形态不在回放范围。
- `--llm=on` 的博查检索返回的是**当下**的网页结果,不是历史当日的——references 环节非严格历史回放。
- A 股 peers 的装饰性涨跌(`peers[].change`)回放中为 null(不影响条目生成与合规扫描)。
- 假期累计路径(`usCumulativeChange`)本身就按日期区间算,历史回放天然兼容,未单独出样本日。

## 状态口径(status taxonomy)

回放和生产使用同一套状态口径,避免把「休市」「兜底」「失败」混成一类。

| 状态 | 含义 | 是否事故 | 是否可发布 | 处理 |
|---|---|---:|---:|---|
| `generated` | 正常生成简报/insight | 否 | 可进入 review/publish | 常规流程 |
| `market_closed` | 美股真实休市或最近有效美股 bar 陈旧,无新隔夜映射 | 否 | 不硬造新简报;可展示回退/状态说明 | 历史简报留状态记录 |
| `fallback` | LLM/博查不可用,规则模板兜底成功 | 否,但需关注 | 进入人工 review,默认低置信 | 标记 `engine=template`, `confidence=low` |
| `blocked` | 合规 guard 命中 HIGH/禁词等阻断项 | 否,属于正确阻断 | 不自动发布 | 显示 blocked reason,人工处理 |
| `failed` | 行情源/数据结构/兜底链路等地板故障导致无法产出 | 是 | 不发布 | 告警 + 人工排查 |

关键口径:

- LLM 失败 ≠ `failed`;只要模板兜底成功,就是 `fallback` / `engine=template` / `confidence=low`。
- `market_closed` ≠ `failed`;真休市不补发、不硬造内容。
- `blocked` 是合规正确行为,不是生成器失败。
- 只有行情源不可用、数据结构异常、兜底也失败等地板故障,才算 `failed`。

## CI / 发布门禁建议

回放矩阵可以直接作为 2.0 收尾后的发布门禁。建议分三档执行:

### 必须 blocking

```bash
pnpm pipeline:replay --date=2026-07-02 --mode=full --dry-run
pnpm pipeline:replay --date=2026-07-06 --mode=market-closed --dry-run
pnpm pipeline:replay --date=2026-07-02 --mode=compliance-block --dry-run
pnpm check:source-leakage --blocking
pnpm check:resolver-samples
pnpm check:relation-lint
```

blocking 条件:

- snapshot `verdict !== "PASS"`;
- `sourceLeakage !== 0`;
- relation sample 任一失败;
- `market_closed` 被误报成 `failed`;
- compliance fixture 未被阻断;
- direct 缺 evidence / unknown relationType / unknown segment。

### 可选但建议 nightly

```bash
pnpm pipeline:replay --date=2026-07-02 --mode=full --llm=on --dry-run
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
- 更细的行业链扩展和 SEO 归档。
