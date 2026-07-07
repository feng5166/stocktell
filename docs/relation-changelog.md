# 关系库变更历史(审计日志)

> C8 审阅台变更历史(负责人 2026-07-04 观察期拍板:先有审计日志即可,不需复杂权限)。
> **约定:每次回灌 staticRelations(改档 / 改 reason / 补证据 / 移出 / 新增)都在此追加一条。**
> git 自带 who(commit author)/ when(commit date)/ commit hash;此表补「改了什么 / 条数 / diff 文件 / note」。
> 三 CLI(`resolver-health` / `relation-lint` / `resolver-samples`)回灌前跑,全过再提交。

| 日期 | commit | 改了什么 | 条数 | diff / 源 | note |
|---|---|---|---|---|---|
| 2026-07-04 | `08072d3` | Phase 1 建统一源 chain-relations.ts,从 insight/chain/美股派生 | 210 建立 | — | 建源,不替换旧逻辑 |
| 2026-07-04 | `3bca2a3` | 应用负责人首轮审阅:drop 广谱 candidate(概念大池)、ai-infra 收窄、trigger 分组、电力链保留 | 210→117 | docs/chain-relations-review-audited.csv | keep64/promote25/retype4/remove117 |
| 2026-07-04 | `12b687a` | v2 审阅回灌定稿:档位 0 差异,reason 用 v2 完整口径 | reason 更新 | docs/chain-relations-review-v2-audited.csv | 未用 downgrade/needs_evidence |
| 2026-07-04 | `567e432` | 闭环测试:浪潮/中际旭创 reason 补验证点(不降档) | 2 改 reason | docs/relation-review-diff-test.csv | 端到端闭环验证,note 零泄漏、daily 未污染 |
| 2026-07-04 | `d0beae0`→`ae5997f` | 13 条 direct 补 references(法定披露入口)+ 四段式验证点 + 证据状态;沪市补上交所公告检索入口 | 13 direct | src/data/direct-evidence.ts | 红旗 13→0;verified 定义收紧;EVIDENCE_LABEL 前台不显英文档 |
| 2026-07-04 | `b3d5709` | 44 条 indirect 补 references + 四段式验证点(环节模板)+ evidenceStatus=partially;澜起/英维克/香农芯创 清概念词旗 | 44 indirect | src/data/indirect-evidence.generated.ts | 黄旗清零;indirect 验证点是环节模板待复核 |
| 2026-07-07 | (2.2-B) | 新增半导体设备与先进制程链:8 环节 enum、8 只国内候选全 candidate 档;触发源【allowlist 收窄】仅 ASML/AMAT/LRCX/CDNS/SNPS(四轮 review 纠账:曾整组路由 11 只,IPGP/SITM/VECO/AMKR/Q/ENTG 未逐票评审已退回未来链) | +13(8 candidate + 5 trigger) | src/data/chain-relations.ts §2.5 | 待审阅台校准升档+补证据;KLAC/TEL/精测/概伦待入池;chains.ts 有意不配 segments(校准后接 insight 管线) |
| 2026-07-07 | (校准回灌) | 半导体设备链 5 只 candidate→direct(北方华创/中微/拓荆/芯源微/华海清科):负责人经 AI 审阅面板终审采纳(判定过程在队列 ai-review 行);补法定披露入口 references + 四段式验证点,evidenceStatus=partially_verified | 5 升档 | src/data/direct-evidence.ts + chain-relations §2.5 | 盛美/长川/华大九天未终审维持 candidate;终审记录曾因按钮语义歧义记为 rejected,已翻转 confirmed 并留 note |

## 回灌工作流(标准动作)
1. 负责人在审阅台(/admin/relation-review)改档/改 reason/批量标记 → 导出 diff(含 dry-run 预览)。
2. 我按 diff 改**源**(insight-chains / chain-relations-audit / direct-evidence / indirect-evidence),不手改 `*.generated.ts`(重生成)。
3. 跑三 CLI(health / lint / samples)全过。
4. `npm run build` 显式确认无 `Failed to compile`(别用 grep 掩盖退出码)。
5. 提交 + push;**在此表追加一条**(日期/commit/改了什么/条数/diff/note)。
6. 生产验证(dynamic 个股页即时、/stocks 静态页下次部署 purge)+ /admin/resolver-health 面板复核。

## 待办(观察期不动模型,记着)
- ai-infra 2 对近义 segment 待归并(铜连接/高速互连(铜)→铜连接/高速互连;数据中心电力/发电→数据中心电力)。
- indirect 验证点为环节模板生成,负责人可逐条复核细化(direct 是手写)。
- reviewQueue / dailyRelationSignals 层③②实现后,daily→review→static 沉淀也在此记录。
