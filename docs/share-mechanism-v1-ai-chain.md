# 分享机制 V1 决策文档 —— 以产业链为单元,AI 链首发跑通闭环(2026-07-02)

> 定位:把 StockTell 的核心产品能力(情绪/联动/为什么动/简报)包装成**可传播的产业链内容资产**,而不是"拉人分享"。
> 骨架已拍板:**以产业链为分享单元 · infra 链无关 · AI 链首发 · 海报优先 · 只归因不返现 · 落地到链页**。
> V1 克制:**只用 AI 链**跑通 `分享 → 点击 → 加自选 / 订阅链` 一条闭环。多链扩张 + 激励机制,等数据验证后再上。

## 1. 目标 & 要证的假设
**假设**:用户愿意把"AI 链今日解读卡"转给朋友/群 → 接收者点进来看到价值 → 转化为(加自选 或 订阅链)。
**V1 成功 = 这条漏斗跑通,且有正向传播迹象。** 不追求规模,追求"闭环成立 + 拿到分渠道转化率与 K 因子的第一手数据"。

## 2. V1 范围(只 AI 链)
做:①AI 链「今日一图」海报 ②分享入口(克制)③短链+ref 归因 ④落地页 `/chain/ai`(两个转化出口)⑤埋点漏斗。
**明确不做(留到数据验证后)**:多链目录/切换/管理后台、个股独立分享卡、微信 JS-SDK 原生分享、任何激励/解锁/返现、关系型分享(共享自选/@朋友)。
**infra 原则**:代码参数化 `chainId`(数据结构链无关),但 **V1 只点亮 `ai` 一条**——用常量配置一个 chain 对象,不建多链表、不做多链 UI。

## 3. 分享物:AI 链「今日一图」海报
一张竖图(适配朋友圈/群截图转发),字段全部**复用现有能力,不新建数据源**:
- 抬头:StockTell logo + slogan「我不懂产业链,你告诉我怎么想」+ 日期
- **今日情绪**:AI 链情绪(复用 `ChainSentiment` / `lib/sentiment.ts`)
- **隔夜联动**:纳指/费半涨跌 + 联动有效率(复用 `lib/linkage.ts` + `fetchUsIndices`);口径"历史统计·非预测"
- **3 条关键动态**:当日简报 top items(复用 `lib/briefings.ts` listBriefing)
- 页脚:二维码(落地 `/chain/ai?ref=…`)+ **免责**(走共享话术常量,见 §9)
- 出图:**Next 内置 `next/og` `ImageResponse`**(不加依赖),端点 `GET /api/share/chain-poster?chain=ai&date=YYYY-MM-DD&ref=CODE` → PNG;服务端渲染、可缓存当天。

## 4. 分享入口(克制,1–2 处)
- `/chain/ai` 页 + 每日邮件/简报底部各一个「分享今日解读」按钮 → 弹层给**海报图 + 「复制链接」**(长按保存/转发)。
- **不做**全站邀请 banner、不做浮层诱导。

## 5. 短链 & 归因
- 落地链接带 `?ref=<code>&utm_source=share&utm_medium=<poster|link>`;`ref` = 登录用户稳定短码(未登录分享给匿名 `shareId`)。
- 归因**只埋点不落库(V1 克制)**:全部走 Umami `track()`;若后续要精确漏斗再补 `share_event` 表。
- ref 仅用于**归因**,V1 不触发任何奖励。

## 6. 落地页 `/chain/ai`(闭环的两个出口)
V1 唯一链页(静态/ISR 优先,承接大陆 TTFB 约定):
- **顶部**:今日情绪 + 隔夜联动(与海报同源)。
- **中部**:AI 链成分股(= 现有股票池)+ 每只「为什么动」一句话(复用 `lib/why.ts`)。
- **两个转化动作(要证的闭环出口)**:
  1. **加自选**:每只成分股旁「+ 自选」。未登录 → 引导注册/登录后加(可先 localStorage 暂存再登录回填,参考八字游客暂存思路)。
  2. **订阅链**:「订阅 AI 链每日解读」按钮 → 登录后置订阅标记 → 进入每日推送(邮件/PWA)。
- 未登录接收者:先看到价值(情绪/联动/为什么动),转化动作再触发登录/注册。

## 7. 埋点事件 & K 因子看板口径
事件(Umami `track()`):
| 事件 | 参数 | 含义 |
|---|---|---|
| `share_poster_generated` | chain, entry(page/email) | 生成了海报 |
| `share_link_copied` | chain, ref, medium | 复制/取走链接 |
| `chain_landing_view` | chain, ref, isNew | 落地页访问(区分新老) |
| `chain_add_watchlist` | chain, code, ref | 从落地页加自选 |
| `chain_subscribe` | chain, ref | 订阅该链 |
| `signup_from_share` | chain, ref | 分享带来的注册 |

**看板口径**:
- 分享率 = 生成海报/复制链接的独立用户 ÷ 活跃用户
- 点击率 = `chain_landing_view` ÷ 分享次数
- 转化率 = (`chain_add_watchlist` ∪ `chain_subscribe` 的独立访客)÷ `chain_landing_view`
- 注册率 = `signup_from_share` ÷ `chain_landing_view`(新访客)
- **K 因子** = 人均有效邀请点击 × 点击→注册率

## 8. 数据模型最小增量(链无关,但只 seed ai)
- **复用**:情绪/联动/简报/成分股/为什么动 全现成,零改。
- **chain 配置**:先用一个常量对象 `{ id:'ai', name:'AI 产业链', members: <现池 codes>, ... }`,**不建多链表**。
- **订阅**:一张 `chain_subscription {userId, chainId, createdAt}`(链无关结构,V1 只写 `ai`);或 V1 极简先用 user 上一个 JSON 字段。走 init-db 幂等建表(prisma db push 连不上库)。
- 海报/落地 无需新表。

## 9. 合规护栏(不可破)
海报 + 链页都带**免责**(走共享话术常量,配合 DRY 审查里"免责话术唯一来源");全程**关联/联动/解读**口径,联动有效率标"历史统计·非预测";**禁**任何持仓收益率/晒单/个股买卖。

## 10. 验证门槛(达标才进 P1/多链/激励)
用 V1 数据判断是否继续投入(具体阈值上线后按基线定,先占位):
- 分享率、点击→注册率、注册→激活(加自选)率、**K 因子** 是否达到"值得扩多链"的水平。
- 达标 → P1(个股卡 + 链页 SEO)→ 多链点亮 → 微信原生分享 → 激励(按链解锁,非现金)。
- 不达标 → 先打磨分享物/落地价值,不盲目铺链(守"先质量后流量")。

## 11. 排期(V1 拆 PR)
1. **PR1 地基**:`/chain/ai` 落地页(复用情绪/联动/成分/为什么动)+ 埋点。
2. **PR2 海报**:`/api/share/chain-poster`(next/og)+ 分享弹层(海报 + 复制链接)+ ref。
3. **PR3 转化出口**:落地页「加自选」「订阅链」+ 订阅表(init-db)+ 订阅进每日推送。
4. **PR4 分渠道埋点补全 + 看板口径校准**。

## 12. 复用清单(直接接)
- 情绪:`src/components/ChainSentiment.tsx` / `src/lib/sentiment.ts`
- 联动:`src/lib/linkage.ts`（+ `fetchUsIndices`）
- 简报动态:`src/lib/briefings.ts`
- 成分股 + 板块大白话:`src/data/stocks.ts`
- 为什么动:`src/lib/why.ts`
- 出图:`next/og` `ImageResponse`（内置，无新依赖）
- 埋点:`lib/analytics` `track()`
- 免责话术:`lib/constants.ts`（DRY 审查后统一）
- 改库:`/api/admin/init-db` 幂等建表

---
_状态:骨架已拍板,V1 范围已收敛。待工程按 PR1→PR4 落地;数据验证门槛达标再议多链/激励。_
