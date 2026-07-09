# StockTell 2.0 · 收尾说明(2026-07-09 定稿)

> 收口四件套第 ④ 件:固化 2.0 的产品边界与运行机制,防止后续把它做回「股票池 + 新闻流」。
> 新贡献者(含 AI 助手)读完 CLAUDE.md 后读本文;细节以各源文件头注释为准。

## 一、StockTell 2.0 是什么

**全球事件 → 产业链传导 → 本土资产映射的因果链推理工具。** 每个交易日自动完成:
隔夜美股异动捕获 → 简报生成(LLM+规则兜底)→ 链级每日推理(热力/判断/风险)→
用户触达(站内/邮件/webpush)→ 收盘记账复盘 → 关系验证回灌。全程带合规护栏与人工审阅位。

## 二、2.0 不是什么(反面清单)

- 不是新闻聚合/资讯 feed:只收事件,必须推演传导与映射
- 不是行情软件:行情只作证据与记账输入,不做盘面指导
- 不是荐股工具:无买卖/目标价/涨跌预测;个股永远是"关系分级的说明性示例"
- 不做"散户怎么想"式短线口吻:统一为 事件→链→映射档→验证点→历史统计非预测

## 三、关系模型(核心资产)

**resolver 三层单一入口**(`src/lib/relation-resolver.ts`):
1. **staticRelations**(`src/data/chain-relations.ts`)——唯一改档入口=代码评审。
   §1 由 INSIGHT_CHAINS mappings 派生(仅 CHAIN_META 注册的链);§2.5 起为手工链
   (半导体设备链首例:显式清单+逐票档位)。**不变量#3**:daily 不改 static。
2. **dailyRelationSignals**(`src/lib/daily-signals.ts`)——由当日已发布简报推导的
   "今日触发"标记,独立于关系档;resolver 同步 getter 维持骨架(热路径不引 DB)。
3. **relationReviewQueue**(`src/lib/relation-review.ts`)——待人工复核沉淀,
   **唯一键 (code,chainId,source) 按源分账**;**不变量#4**:队列绝不自动改档。

**关系类型**:`trigger`(海外触发源)/ `direct`(直接映射,**必须带
references+verificationPoints**,铁律②不编造 URL——深市巨潮/沪市上交所检索入口)/
`indirect`(隔一层,同样要证据)/ `sentiment` / `weak` / `candidate`(待人工终审,
前台如实标"待验证")。前台色系:红只留风险/合规提示。

**审阅与回灌流程**:candidate 入池 → AI 审阅(两入口:队列面板=轻决策✓✕;
校准工作台=批量 diff 流,AI 建议一键进编辑态)→ 负责人终审 → 导出 diff →
助手回灌 chain-relations/direct-evidence(+changelog 登记)→ 三 CLI+replay 验证 →
上线。半导体设备链两轮走通全流程(7 direct+1 indirect+2 candidate)。

## 四、状态口径(全站对齐,2.1-A)

`BRIEF_STATUS_UI` 五档+辅助:`generated` 已生成 / `fallback` 模板兜底(琥珀,进人工审)/
`blocked` 合规阻断(**内容不外发**,仅状态横幅)/ `market_closed` 美股休市(中性,
非事故)/ `failed` 生成异常(红,唯一事故档)/ `manual_reissue` 人工补发。
subType `holiday_bridge`=节后首日观察。归档页语义:无条目且无状态=404,不硬造空页。
告警分级 `briefAlertSeverity`:none/notice/incident,吃上下文(发布数/状态读取/补位窗口)。

## 五、可靠性机制(2.2 之后的运行底座)

- **replay 门禁**:`scripts/pipeline-replay.ts` 四模式(full/market-closed/
  compliance-block/holiday-bridge);`--fixture` 零网络回放+稳定子集对照录制值,
  **结论漂移 PR 显式红**,有意变更须 `--record-fixture` 重录随评审
- **CI(relations-check)**:关系 lint/样本断言/健康检查/泄漏检查/watchlist 冒烟/
  双 fixture 回放全 blocking;nightly=外部源健康检查(红≠门禁破)
- **source-leakage**:内部源身份零外泄检查
- **自愈**:交易日历 KV 预缓存(Tushare 抖动不打穿);收盘记账回看补记+17:30 二次班次;
  schema 启动哨兵(改库忘跑 init-db → 启动即飞书);cron 失败飞书告警带 runbook 指令
- **改库约定**:DDL 进 `/api/admin/init-db`(幂等)+ instrumentation SENTINELS 相邻改,
  部署后手动重跑 init-db

## 六、双仓工作流

主仓 `~/claudeproject/stocktell`(main,push 即 Vercel 部署)+ worktree
`stocktell-2.0`(stocktell2.0 分支)。**每笔提交 cherry-pick 双分支,
`git diff main..stocktell2.0` 必须为空。** 本地构建验证看退出码(只 grep
"Compiled successfully" 会漏 lint 错误——07-09 实踩)。

## 七、2.1 / 2.2 边界(已完成,勿重做)

- 2.1:状态口径全站对齐/Holiday Bridge/审阅队列持久化/SEO 归档/Watchlist 状态页
- 2.2:fixture 资产化(A)/半导体设备链全流程(B,扩链方法论模板)/商业化准备(C,
  埋点+/pro 意向收集+运营看板;**真收费前必须法律意见**)
- 后续候选:HBM/存储链(照半导体链流程)/专业版分层(等意向数据)

## 八、历史教训(review 六轮沉淀,新功能自查)

1. 新建基建要 grep 旧模式全量迁移(半截迁移=两套并存)
2. 门禁绿≠管线对——门禁自身要有质量闸(录制/触发/对照)
3. UI 显示成功≠数据落定——写路径双侧验证,校验下沉服务端
4. 全局数据喂链级字段=三链同文(按链分账,注意 CHAINS id ≠ 关系链 id,
   用 `chainIdFromSlug`)
5. fail-safe 跳过是对的,但恢复也要自动化(自愈>runbook>人肉)
