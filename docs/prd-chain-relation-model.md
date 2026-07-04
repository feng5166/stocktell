# P1 产业链关系数据结构化(设计稿)

> 负责人 2026-07-04 拍板开题。**本稿只设计数据结构 + 迁移策略,不改页面。** 目标:让 chain / insight /
> stock / stocks / watchlist 彻底吃**同一份**关系数据,消灭"一会儿强关联、一会儿直接映射"的双轨。
> 状态:设计待评审 → 评审过再排实施(实施不在 2.0 管线验收期动页面主干)。

## 0. 三层架构 + relationResolver(负责人 2026-07-04 拍板;骨架先设计、audit 回灌后再实现)

**边界铁律:每日管线关系【绝不】直接污染静态关系库。** 分三层:

| 层 | 内容 | 有效期 | 来源 |
|---|---|---|---|
| `staticRelations` | 人工核定、长期有效(= chain-relations.ts,只吃 audit 回灌) | 长期 | manual |
| `dailyRelationSignals` | 每日管线生成的当天事件信号 | 短期(当天) | pipeline |
| `relationReviewQueue` | 多次出现、待人工沉淀或剔除的候选 | 过渡 | pipeline→manual |

**`relationResolver` = 唯一读入口**(解决"改一处漏几处"DRY;/stocks、stock、watchlist、track、chain 页全走它):
- 读 staticRelations + 合并当天 dailyRelationSignals + 合并 reviewQueue 必要状态;
- 输出统一 relation view,带 `source` 标记:`static`(长期关系)/ `daily`(今日触发)/ `review`(待核定)。

**硬规则(拍板③):resolver 合并时 dailyRelationSignals 【不能自动提升 relationType】。** 例:静态是 indirect、
今日 signal 命中强事件 → 前台可显"今日触发强",但**不能把长期关系显示成 direct**。输出三字段分开、不混成一个:
```ts
type ResolvedRelation = {
  relationType: RelationType;      // 长期档位(只来自 staticRelations)
  todaySignalStrength?: '强'|'中'|'弱'|null; // 今日触发强度(来自 dailyRelationSignals,独立字段)
  source: 'static' | 'daily' | 'review';
  // …chainId/segment/reason/verificationPoints/confidence 同 StockChainRelation
};
```
沉淀路径:dailyRelationSignals 多次命中同一 code → 进 relationReviewQueue → 人工在审阅台确认 → 回灌 staticRelations。

## 1. 问题:关系数据现在散在 5 处、各页各取一份

| 来源 | 内容 | 谁在用 |
|---|---|---|
| `data/stocks.ts` `relations[]` / `relationTypes[]` | 名称级关联 + 产业链/资本开支/电力映射标签 | /stocks 筛选、个股页 peers |
| `data/relations.ts` `edgeInfo` / `STRENGTH_BADGE`(强/中/弱) | 美股↔A股 供货强弱边 | 个股页 peers、关联图谱、特征矩阵 |
| `data/insight-chains.ts` `mappings[]` | 核定 关系(直接/间接/情绪/弱)+ segment + reason + confidence | insight 页、relation.ts |
| `data/chains.ts` `segments[]` + `aMembers` | 链→环节(sectors)→ 成分 | 链页 roster、watch-relation |
| `lib/relation.ts` / `lib/watch-relation.ts`(派生) | codeRel/codeSeg/codeReason/chainMap | 首页事件卡、自选卡、/stocks 地图、个股一句话判断 |

**后果(用户可见双轨):** 个股页 peers 显「强/中/弱关联」,而 insight/链页/自选卡显「直接/间接/情绪/弱映射」——
同一关系两套词,降体系可信度。且「触发源」「待验证/候选」这两档现在只在 /stocks 地图临时算,没进模型。

## 2. 目标数据结构:`StockChainRelation`(单一真源)

```ts
type RelationType = 'trigger' | 'direct' | 'indirect' | 'sentiment' | 'weak' | 'candidate';
type StockChainRelation = {
  code: string;
  chainId: string;
  chainName: string;
  segmentId: string;
  segmentName: string;
  relationType: RelationType;          // 触发源/直接/间接/情绪/弱/候选(六档,含触发源与候选)
  confidence: 'high' | 'medium' | 'low';
  reason: string;                      // 位置+为什么相关+要验证什么(人话,复用 insight reason)
  verificationPoints: string[];        // 订单/客户/收入/利润/国产替代…结构化验证点
  relatedInsightIds?: string[];        // 挂相关 insight(个股页「相关 insight」)
  evidenceStatus?: 'verified' | 'partially_verified' | 'needs_review';
};
```

- 一只票可有多条(多链多环节)→ `StockChainRelation[]`。全站统一从 `relationsForCode(code)` 取。
- **六档 relationType 与现有映射:** 强关联→`direct`、中关联→`indirect`、弱关联→`weak`、主题联动→`sentiment`、
  美股触发源→`trigger`、未核定 A 股→`candidate`。前台展示归并(弱→弱/情绪同色)沿用 `relation-rank.ts`。

## 3. 单一真源怎么建(不重复劳动,最大化从现有派生)

新增 `data/chain-relations.generated.ts`(或 curated `data/chain-relations.ts`),构建顺序:
1. **从 insight-chains `mappings` 派生**(已有 relationType/segment/reason/confidence)——核过的 A 股直接进,`evidenceStatus` 由 confidence 映射。
2. **从 chains `aMembers`×`segments` 补**未核过的成分股 → `relationType='candidate'`、`confidence='low'`。
3. **从 relations.ts `edgeInfo` 补**美股触发源 → `relationType='trigger'`(不进 A 股映射档)。
4. **人工 curate**缺口:`verificationPoints`(订单/客户/收入/利润/国产替代)、`relatedInsightIds`、`evidenceStatus` 由负责人按环节补(可先给核过的数十只,其余留 candidate)。

> 红线沿用:relationType/confidence **只来自核定源或规则**,不接受客户端;URL/证据绝不自产(见 [[stocktell-insight-pipeline]] 红线)。

## 4. 迁移策略(关键:数据层先行,页面零视觉漂移)

**Phase A — 建源 + 单一访问器(不动页面):**
- 建 `chain-relations`,导出 `relationsForCode(code): StockChainRelation[]` 与 `primaryRelation(code)`(取最强档)。
- `relation.ts` / `watch-relation.ts` 的 `insightBundleForCode`/`buildWatchChainMap` **改为从新源派生**(保持现有签名 → 现有页面不动、行为不变)。这一步纯内部换源,产出必须与现状逐字节一致(加回归快照)。

**Phase B — 消费方逐个切到访问器(仍不改 UX):**
- /stocks 地图、个股一句话判断、自选卡、链页 roster、insight 页 → 全部走 `relationsForCode`。删各自的临时派生(如 /stocks 地图 relDist 的触发源/待验证临时算 → 用模型的 trigger/candidate)。

**Phase C — 落地 8 项能力(才有新 UI,逐页评审):**
1. /stocks **链/环节筛选**(chains[]/segmentId 作筛选维度)。
2. 个股页 peers **badge 强/中/弱 → relationType 全量统一**(退休 STRENGTH_BADGE 双轨;图谱/矩阵同切,一次性)。
3. 个股页 **相关 insight**(relatedInsightIds)。
4. **验证点结构化**(verificationPoints:订单/客户/收入/利润/国产替代 + evidenceStatus 状态)。
5. **模块级 references**(挂到关系/环节)。
6. watchlist 关系卡走同源(更稳)。
7. chain/insight/stock/stocks **同一真源**(本 PRD 的终态)。

**Phase D — 退双轨:** 删 `STRENGTH_BADGE` 强/中/弱、各页残留硬编码关系词。全站只剩 relationType。

## 5. 边界 / 风险
- **不重构页面 UX**,只换数据源 + Phase C 的筛选/badge/insight 增量。Phase A/B 必须零视觉漂移(回归快照护栏)。
- `STRENGTH_BADGE` 跨用(关联图谱/特征矩阵)——Phase C 改 badge 时这几处**一次性同切**,不能只切个股页(否则新双轨)。
- `trigger` vs `direct`:美股是触发源不是 A 股映射,模型里必须分开(沿用 /stocks 地图已确立的口径)。
- 数据量:核过数十只先做全字段,其余 candidate 占位,不阻塞上线;`verificationPoints`/`evidenceStatus` 人工 curate 分批补。

## 6. 不在本批
页面 UX 重构(如个股页字面列序)、更多 insight 链、分享铺量、对话。见 [[stocktell-2.0-closeout]]。

---
_评审通过后按 Phase A→D 排实施;实施避开 2.0 管线 10 日验收期动页面主干。_
