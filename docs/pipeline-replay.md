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
