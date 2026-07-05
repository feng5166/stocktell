# stocktell2.0 合并到 main · 代码评审清单

> 评审对象:stocktell2.0 分支合并进 main 的功能代码,两大块——**insight 生产管线 M1**(schema/护栏/生成/落库/新 cron/审核页/端点,~1600 行)+ **P1 自选闭环**(首页「和我相关」结构化关系卡)。
> 方法:两轮独立多智能体评审(合计 62 agent),逐条对抗验证 + 人工抽验关键项。评审只报不改,**修复由维护者认领**。
> 评审时点:HEAD=`f7cd3b5`,2026-07-03。评审人:Claude(营销发行侧代跑,非维护者)。

## 总体结论

**可以上线**。无跨权限漏洞、无数据损坏;insight 四条红线靠「构造式强制」基本守住(confidence 生成侧封顶 / relation 源自 chains config / URL 仅来自检索 / 同图谱退化 fail-closed 停线),异常时永远回落到安全内容而非违规内容。

**系统性弱点(两轮评审都独立指向同一处):护栏执行不一致。** 去交易化禁词 + 具体涨跌数字校验只在 insight 生成侧 `runGuards` 里强制;自动发布的**简报/早报/链级判断**和**人审 publish**两条上线路径都只做数字或 schema 校验,禁词无代码强制、仅靠 prompt。

---

## P0 · 明早 07:05 insight-daily 自动产出前建议先补

这两条叠加 = 一次博查出网抖动 → 当日无 insight 草稿 + 硬杀绕过 catch + 飞书零告警 + 没有真实补跑兜底。

| # | 文件:行 | 问题 | 建议 |
|---|---|---|---|
| P0-1 | `src/lib/bocha.ts:27` | `bochaSearch` 的 fetch **无 AbortController/超时**——insight 生成热路径唯一裸奔的出网调用(旁边 verifyUrl 5s、LLM 12/15s 都有)。博查(大陆阿里云,已知又慢又抖)挂起 → undici 默认 ~300s ≫ maxDuration 120s → 整条生成卡死被平台硬杀 → 绕过 route per-chain catch → 当日无 draft、零告警。 | 改用 `fetchJsonWithTimeout`(tushare 已在用)或加 AbortController ~8s;buildReferences 已按不致命 catch 降级,加超时即恢复受控。 |
| P0-2 | `vercel.json`(crons) | **承诺的 07:45 补跑 cron 根本不存在**。`insight-daily/route.ts:15/56` 和 `briefing-watchdog:73` 三处都写「07:45 会补跑」,但 crons 只有 `5 23`(07:05),无 `45 23`。主跑失败后无任何自动补跑,值班照不存在的任务干等。 | 加 `{path:"/api/cron/insight-daily", schedule:"45 23 * * *"}`(route 已有 hasDaily 幂等,安全补跑);若不加则删掉那三处 07:45 话术。 |

## P1 · 合规(系统性,两轮都点)

| # | 文件:行 | 问题 | 建议 |
|---|---|---|---|
| C-1 | `generate.ts:369` + `morning-brief.ts` + `chain-take.ts` + `admin/insights/route.ts:68` | **禁词护栏在自动发布的简报/早报/链级判断上完全没代码级强制,只靠 prompt。** 已核实:generate.ts:369 只查数字不查禁词,morning-brief/chain-take 连 guard 都没 import。模型某天回「光模块可低吸、关注企稳」(无数字、过字数门槛)会 status:published 自动发给全体用户,绕过铁律③。人审 save/publish 同样不重跑禁词扫描(注释「发布前都重新校验」名不副实)。 | 把 `scanBannedWords`(带 INDUSTRIAL_WHITELIST)+ `hasSpecificMove` 复用到 generate/morning-brief/chain-take 生成后、以及 admin publish 前的 clean payload 上,命中即中性化/回退模板/400 拒绝并告警,与 insight 管线口径对齐。**这是维护者的 guard 体系与合规口径,由维护者定中性化策略。** |
| C-2 | `generate.ts:211` | 具体涨跌数字红线的正则只匹配半角 `\d`,漏中文数字与全角(「涨了三个点/大涨近十个点/涨了５%」)。 | 扫描前把全角数字/百分号 normalize 成半角,再补一条中文数字量级正则;guard 与简报共用同一函数双路覆盖。 |
| C-3 | `admin/insights/route.ts:86-92` | relation 只读锁(enforceReadonlyRelations)按「与上一版 diff」比对,对草稿里**不存在的新 code** 会回落请求体传入值(`prevMap.get(code) ?? m.relation`),不从核定源重算。持 ADMIN_TOKEN 绕过 UI 直接 POST 一条新 code + `relation="直接映射"` 能随 published 落库(公开页不渲染 mappingsDelta,经 UI 不可达)。 | enforceReadonlyRelations 对每行 relation 一律从核定源重算覆盖(`relationForCode(code) ?? 段默认关系`),解析不到核定数据的 code 直接丢弃或返 400,彻底不信任客户端 relation。 |
| C-4 ✅**已修**(`56a82b3`) | `insight-pipeline/docs.ts:62-76` | 红线#4「管线自动暂停,直到人工恢复」的暂停位写进 `morning_brief_cache`,而 `briefing-watchdog` 的 sweepCaches 会 14 天 TTL 清扫它 → 暂停态 14 天后被静默清掉自动恢复。**注:该 TTL 清扫是 cron 加固时新加的,责任在 cron 加固侧。** | **已修**:sweepCaches 加 `NOT` 排除 `CONTROL_KEY_PREFIXES=["insight-paused:"]`,不再扫控制位(新控制键往该列表加)。**遗留给维护者的更根本改法(可选)**:暂停位别复用缓存表、改存 InsightDoc 专用列;且 pauseKey 的 updatedAt 是 @default(now()) 不刷新,若改回缓存表存储需注意。 |

## P1 · 用户现在就能看到的功能 bug

| # | 文件:行 | 问题 | 建议 |
|---|---|---|---|
| B-1 | `chain/[id]/page.tsx:204` | **/chain/ai 页字面星号泄漏**(已核实)。该页 `{it.retailTake}` 纯文本渲染,但 generate.ts 已把 retailTake 改成四段 markdown(`**这次变了啥**…`)→ 任一 AI 链有当日简报时,用户看到一堆字面 `**` + 段标签挤成一行,且前缀「这条逻辑怎么验证:」与末段「后续怎么验证」语义重复。BriefingFeed 已有 TakeBody 处理,此消费点漏改。 | 复用 BriefingFeed 的 TakeBody(inlineBold + 按 TAKE_SECTIONS 拆段)并去掉多余前缀。AdminBriefingClient.tsx:160 同类为 admin-only 可低优。 |
| B-2 | `BriefingFeed.tsx:462` + `watch-relation.ts:35` | 美股锚点自选被误标。buildWatchChainMap 只遍历 A 股成员,QuickAddWatch 允许加入的美股锚点(如英伟达)即使正是当日事件 triggerCode,持仓视角卡因 chainMap 未覆盖把它塞进折叠的「暂未纳入覆盖·无今日触发」,而同页事件卡已渲染它——自相矛盾。 | 对 uncovered 自选码也做 triggerCode/beneficiaries 命中检测,命中给「今日触发」+ 事件标题;链锚点美股单列为「美股锚点」。 |
| B-3 | `BriefingFeed.tsx:586` + `watch-relation.ts:35` | 关系卡口径与 insight 核定内容矛盾。(a) 环节标签由 stocks.ts 粗粒度 sector 经 segmentOf 反推,丢弃 insight mapping 里核定的 segment;(b) 拿「每只票核定 relation」填「环节级」解释句。实例:澜起科技 sector=「存储/HBM」反推环节,正面违背 insight 核定「服务器内存接口/DDR5,别按 HBM 理解」;天孚通信核定「间接」而同屏因果卡标该环节「最直接」。弱触「无依据/可回溯」红线。 | 环节标签优先取 insight `mapping.segment`(无核定 mapping 才回落 segmentOf);relation 与 segment 绑到同一条核定 mapping;REL_EXPLAIN 区分「环节传导层级」与「个股在环节内距离」,或解释句主语改成个股。 |

## P2 · 安全

| # | 文件:行 | 问题 | 建议 |
|---|---|---|---|
| S-1 | `generate.ts:281`(verifyUrl) | 盲 SSRF。references 校验对博查检索来的外部 URL 发服务端 HEAD、`redirect:follow`、无 host 白名单/私网拦截,每交易日 cron 无人值守自动触发。攻击者让恶意页在检索词命中并 302 到内网/元数据端点即可探测(需 SEO 命中,概率性;仅盲 HEAD 无外泄通道)。 | 对非 STANDING_REFS 的检索 URL 做 SSRF 加固:拒绝私有/保留网段与非 http(s);verifyUrl 改 `redirect:"manual"` 逐跳复核 host;3xx/403 归入「未确认」而非 verified。 |

## P2 · 低危 / M1.5 增链前必修

| # | 文件:行 | 问题 | 建议 |
|---|---|---|---|
| L-1 | `insight-pipeline/docs.ts:53-57` | getRecentHeatSignatures 用 `take:n` 取「n 行」而非「n 个不同日期」,force 重跑留同日多行会把同日重复当连续多天 → 误触红线#4 自动暂停。 | 取样前按 date 去重(每 date 留最新一条指纹)再比对。 |
| L-2 | `insight-pipeline/docs.ts:133-148`(publishDoc) + schema:280 | superseded「每链每日至多 1 published」只靠应用层 `$transaction([updateMany, update])`,无行锁、库无 partial unique;READ COMMITTED 下并发发布两篇不同 draft 可双 published。 | init-db 加 `CREATE UNIQUE INDEX ... ON insight_docs(chain_id,date,kind) WHERE status='published'`,或事务内 SELECT...FOR UPDATE / SERIALIZABLE。 |
| L-3 | `insight-daily/route.ts:13,29-83` | maxDuration=120 对单链最坏耗时(2×12s+2×15s+refs≈113s)已临界,串行 for-of 无剩余时间预算闸门;M1.5 增链后重试叠加 >120s 会硬杀在循环中段、漏网链静默(当前仅 ai 链潜伏)。 | 收敛重试放大(genJudgment/genHeat 已带 SDK maxRetries=1,外层又包循环——去外层或下调 timeout);循环内加已用时预算(剩余<25s 则 break 交补跑并告警);循环末尾核对已处理链数<配置链数 则 alertCron。 |
| L-4 | `insight-pipeline/generate.ts:217-232`(genHeat) | 未按 segment 去重:LLM 对同一环节返两条时两行都落库,污染 heatSignature(红线#4 比对)与审核页 `key={h.segment}`。 | valid 之后按 segment 去重(保留首条)再 fill;或 schema 对重复 segment 追加错误。 |
| L-5 | `admin/insights/route.ts:73`(publish) | publish 不校验 doc 当前状态,已 rejected/superseded 的文档可被重新发布上线,状态机缺「只有 draft 可发布」约束(admin-only,无越权)。 | publish 前校验 `doc.status∈{draft}`,拒绝 rejected/superseded(复活须先改回 draft)。 |
| L-6 | `home/ReasoningCards.tsx:99` + `insight/[slug]/page.tsx` | 首页因果链卡三层用 `key={t.level}`,同档 relation 的多个环节产出重复 level → 重复 React key(daily 一发布即走此路径,当前仅 console 警告)。 | key 改 `key={\`${t.level}-${t.what}\`}` 或 map index,两处统一。 |
| L-7 | `insight-pipeline/schema.ts:77,91,105` | validateDailyPayload 对 heat/mappingsDelta/references 里的非对象元素(如 null)直接解引用抛 TypeError → 畸形 payload 变 500 而非 400(仅影响 admin 提交路径,无数据损坏)。 | 循环内每元素先 `if(!h||typeof h!=='object'){errs.push;continue}`,enforceReadonlyRelations 同样防御。 |
| L-8 | `insight-daily/route.ts:36` | 链处于暂停态时每次 cron 都无节流发一条 alertCron,primary+backup 每天 2 条飞书直到人工恢复,连续多日刷屏。 | 只在「首次进入暂停」告警,paused 分支静默跳过或大幅降频。 |
| L-9 | `home-feed.ts:112` | 活跃环节不足 3 个时 topHeatTiers 回退全量 heat,把 direction=观察(👀)的环节也当「今日最重要因果链」三层展示、level 仍显示最直接,语义矛盾且违背自身「观察靠后」注释。 | 活跃不足 3 时只展示活跃环节(允许少于三层),或给观察行中性末位 level 并把 direction 纳入排序。 |

## P3 · DRY / 一致性(改一处漏几处的隐患)

- **关系→配色/排序表 5+ 处逐字节重复**:配色四份(BriefingFeed:718 / chain/[id]:21 / ReasoningCards:12 / insight/[slug]:27),排序两份(BriefingFeed:434 与 home-feed:110)。调一次「情绪映射」chip 颜色或新增关系档 → 四处漂移。建议在 `lib/relation.ts` 抽单一规范化关系 token(配色+序,兼容长/短标签),各处引用。
- **链级判断双套 prompt/生成器**:JUDGMENT_PROMPT/genJudgment 与 chain-take.ts TAKE_PROMPT/buildChainTake,去交易化禁词子集各自内联维护易漂移。建议共用一份 prompt 构造器 + 单一禁词清单(从 guard.ts BANNED 渲染)。
- **sector→环节兜底两套假设**:generate 返回硬编码 FALLBACK_SEGMENT,watch-relation 返回 segments[末位],chains.ts 调序/改名会静默分叉。建议 chains.ts 提供单一 `segmentForSector(chain, sector)` helper。
- **隔夜方向概述重复**:triggerSummary 与 generate.buildTrigger,一处按 triggerName 去重、一处按 triggerCode 去重,同名不同 code 时两天措辞可无声翻转。
- **schema 注释字数上限与校验器不一致**(reason 注释≤60/校验>80 等),提成命名常量三处共享。

---

# 第二批评审(2026-07-03 晚 · 针对维护者对上批的修复 + 新增电力链)

> 评审对象:上批评审后 2.0 的两批新工作——① 维护者对上批 P0/P1 的批修(commit `50d7434`+`9213883`);② 新增「数据中心电力链」M1.5 增第二条链(`2e9c5e5`/`45b5cbe`/`b394641`/`bad538d`/`fe9a6df`)。
> 基线 HEAD=`f7cd3b5`,评审 HEAD=`fe9a6df`。6 维度多智能体 + 对抗验证 + 人工抽验关键项(26 候选→25 存活)。
> **结论:上批 P0/P1 大方向修到位**(bocha 超时 / content-guard 抽取共用 / RetailTake 星号 / SSRF 字面 IP 段+redirect:manual / 美股锚点分区 / segmentForCode 优先核定 / relation 只读锁重算 均落地),**但有 2 处 HIGH 合规硬伤未覆盖 + M1.5 增链未同步升级监控 + 我方 cron 加固被侵蚀 2 处**。

## 第二批 · P0(合规 HIGH + 明早电力链两链产出可靠性)

| # | 文件:行 | 问题 | 建议 |
|---|---|---|---|
| B2-1 合规HIGH | `generate.ts:356` | **简报 title 完全没过 content-guard**——P0-3 只给 retailTake 加了中性化+禁词扫描,`title:it.title` 原样落库(上头条+飞书推送+早报正文)。 | ⚠️ **不要对 title 做 number-neutralize**:标题按设计陈述触发源事实涨跌(「美光隔夜大涨15.7%」是既定安全口径)。**正确修法:title 只跑 `scanBannedWords`**(拦「低吸/企稳/接盘」进标题),不动数字。 |
| B2-2 合规HIGH | `relation.ts:11`(+`chain/[id]/page.tsx:277`、`watch-relation.ts:38`) | **relation 跨链取最强档**——codeRel 遍历所有 insight 链取最强 relation。加电力链后英维克/盛弘/科士达在 AI 链核定「间接」却因电力链「直接」被越级,/chain/ai 和自选卡一律显「直接」,违「relation 单一核定源」(V-1 修复引入的新回归)。 | 链页/自选卡按**本链** `INSIGHT_CHAINS[slug].mappings` 取 relation(chain-scoped);事件卡的跨链最强档 relationLabelFor 另有语义、勿动。 |
| B2-3 可靠性 | `insight-daily/route.ts:13/29` | **两链串行、maxDuration 只 120→180、无按链时间预算**——单链最坏~113s,两链~226s>180。主跑遇 LLM/bocha 逼近超时时电力链被 180s 硬杀在循环中段,**绕过 per-chain catch→无草稿无告警**(即"硬杀静默")。 | 循环内加「剩余<一条链最坏耗时则 break+alertCron」闸门,或 maxDuration 覆盖 2×单链(~300),或 Promise.allSettled 并发。 |
| B2-4 可靠性 | `briefing-watchdog:80` | **08:30 insight 心跳只按跨链总数判活**——`insightDoc.count` 不带 chainId,只要 ai 出草稿 count≥1 就判正常,电力链单独断产/被误暂停永不告警(insight-daily 注释「看门狗兜底不会漏」在多链下失效)。 | 遍历 segments 链分别 count 当日 draft,任一为 0 即点名告警(区分「暂停待恢复」与「疑似断产」)。 |
| B2-5 可靠性 | `insight-daily:62` | 电力链是**外溢链**(读同一份 AI 简报),多数天 4 环节全「观察」→heatSignature 逐日相同→heatStreak≥3→**误触自动暂停**。 | 外溢/非事件驱动链关掉自动暂停,或把「全观察」指纹排除出 streak 计数,或只警告不自动暂停。 |

## 第二批 · P1(修复未竟 + 我方 cron 被侵蚀 + 电力链数据)

| # | 文件:行 | 问题 | 建议 |
|---|---|---|---|
| B2-6 修复未竟 | `admin/insights/route.ts:89` | C-3 声称 P1 批修,**该文件本批零改动**——enforceReadonlyRelations 对草稿外新 code 仍 `prevMap.get ?? 客户端 relation` fail-open。持 ADMIN_TOKEN 仍能塞新 code+`relation=直接映射` 落库。 | relation 一律从核定源重算覆盖(mapping 用 relationForCode、heat 用 segment.defaultRelation),解析不到的 code 丢弃/400,不用 `??客户端值`。 |
| B2-7 我方cron | `briefing-backup:48` | 我的加固(r.ok 检查、280s abort→inconclusive)**保留了**,但维护者在 abort 分支后加了 `await backupInsightDaily()`——**无超时/无 signal 的 fetch**。补位真正管用那天(下游跑满 280s)abort 后再 await 它可能耗到 insight 的 180s,**吃穿 backup 的 300s 被硬杀、我留的 inconclusive 返回丢失**。 | abort 分支跳过 insight 补触发(成功路径+看门狗已双覆盖),或给它 5s 短超时「派发即返回」。**(这条是改我的加固时引入的,评审侧可协助收尾)** |
| B2-8 漏洞 | `chain/[id]/page.tsx:279` | 电力链专属 roster 覆写(groupOverride/sectorLabels/groupNotes/bottomSectors)**无 chain.id 判断**地传给共用组件,**污染 /chain/ai**(能源/核电股被改名「能源侧外溢(弱/情绪)」置底、思源被拉进虚构组)。 | 覆写按 `chain.id==='data-center-power'` 才传,或收进 ChainConfig(rosterGroups)由各链自带。 |
| B2-9 合规 | `content-guard.ts:9` | BANNED 漏收 prompt 自身明列的操作词:接盘(chain-take 明列)、止损/止盈/建仓/补仓/重仓/半仓/空仓/打板。 | 补进 BANNED,做一次「prompt 禁语 ↔ BANNED」一致性对齐。 |
| B2-10 合规 | `ChainRoster.tsx:52` | 电力链 roster 组内仍按全局 TIER「龙头」加权排序,间接的麦格米特(龙头)被顶到直接的盛弘/科士达之上,违 relation-grading-standard.md「不得按龙头分级」(仅排序失当,关系档本身未改)。 | 组内排序主键改关系档(直接>间接>情绪>弱)、mentioned 次之,去龙头加权。 |
| B2-11 修复未竟 | `insight-pipeline/generate.ts:226`、`home/ReasoningCards.tsx:99`、`content-guard.ts:29` | L-4 genHeat 未按 segment 去重、L-6 React 重复 key 两条列为已修实为未改/延期;content-guard 中文数字支路强制带涨跌前缀、漏「百分之X/X个百分点/回撤两成」。 | 见上批 L-4/L-6;content-guard 中文支路去掉强制前缀单独匹配「[一二…两]+(个多?点|成)」+补「百分之X」。 |

## 第二批 · P2(低危)
- `generate.ts:290` SSRF 私网拦截留 IPv4-mapped IPv6(`[::ffff:169.254.169.254]`)与 DNS rebinding 盲点(字面 IP 段与 redirect:manual 已挡)——剥 `::ffff:` 前缀再判、纳入 `::`/`::1`。
- `content-guard.ts:12` INDUSTRIAL_WHITELIST 漏「产能放量/开始出货/加速出货」→正当产业表述被误判违规(fail-safe 过阻)——白名单扩到动词搭配层或对 出货/放量 做上下文豁免。
- `briefing-watchdog:86` 简报当天完全没产出时 insight 心跳误报「管线疑似断产」+无效 force=1——心跳只在「已有已发布简报却无 insight 草稿」时才判 insight 问题。
- `BriefingFeed.tsx:535` 美股锚点组标题对全部自选美股泛称「产业链触发源」,未触发美股措辞偏松——组标题也按 isTrigger 区分。
- `generate.ts:367` 三简单路径命中禁词静默退模板无告警——回退时打一条轻量去重告警。
- `home-feed.ts:111`/`insight-chains.ts:259` DRY(relRank 重复)/电力链 heatmapNote 图例「观察」与实际值「中性」不一致。

---

# 第三批评审(2026-07-04 · 复核第二批修复 + 新功能 AI 应用事件路由 + DRY 重构)

> 评审对象:第二批修复(`7f0f352`)之后的四批工作——① 生成侧 B2-2 漏网补修 + 飞书待审增强(`66977c9`);② 清留待项 B2-6 安全 / B2-11 / P2 一批(`c4020d6`);③ 新功能 P1.1 AI 应用事件触发源路由(`2a0f09c`,新 `trigger-sources.ts`);④ DRY 关系配色单一真源(`5e03b8a`,新 `relation-rank.ts`)。
> 基线 `7f0f352` → HEAD `5e03b8a`。6 维度多智能体 + 对抗验证 + 人工抽验关键项(19 候选→18 存活)。
> **先说结论:B2-2 生成侧越级收敛(relationForCodeInChain)与 B2-6 防越级核心(relation 一律从核定源重算、绝不用客户端值)真到位;新 AI 应用路由功能合规定位安全;DRY 重构无现网 UI 回归。** 但有 2 处合规红线 + 数处修复未竟,详下。
> **B2-7(我上批引入的回归)已由我方 `f5f0c5f` 补全 catch 内 sibling 分支,第二批已闭环。**

## 第三批 · 合规红线(人工抽验确认属实)

| # | 文件:行 | 问题 | 建议 |
|---|---|---|---|
| B3-1 合规·中 | `content-guard.ts:31` | **「成」正则是净回归**——实际 `/[一二三四五六七八九十两]+\s*成(?![功语交色本长熟就)])/`,两头翻车:**漏拦**「两成**就**见顶」(就被前瞻排除)、「回撤**3**成/跌去**５**成」(这支只吃中文数字、不吃半/全角阿拉伯);**误伤**「一成不变/毛利率三成/九成新」(当成具体涨跌数字→正当产业解读被弃回退+假红线告警)。 | 改白名单剥离法:先 `replace(/成功|成交|成本|成色|成语|成长|成熟|成就|一成不变/g,'')` 再 `/[0-9０-９一二三四五六七八九十两]+\s*成/` 命中,统一半/全/中文数字口径、不误伤成词。**(合规红线路径,建议优先修)** |
| B3-2 合规·低-中 | `admin/insights/route.ts:69` | admin save/publish 只跑 `validateDailyPayload`(结构/schema),**不跑 content-guard**(禁词/涨跌数字)。持 ADMIN_TOKEN POST「建议买入,目标价50元,今日涨了5%」绕过生成侧 runGuards 硬闸、发布后原样上 insight 页。**人审是主闸,这是代码级纵深缺失**(生成侧有、人审发布侧没有)。 | updatePayload/publishDoc 前对 clean 跑 runGuards(或 isComplianceClean),blockers 非空返 400,与生成侧同一道护栏。 |

## 第三批 · 修复未竟 / 漏洞

| # | 文件:行 | 问题 | 建议 |
|---|---|---|---|
| B3-3 中(风险可控) | `insight-pipeline/generate.ts:295` | **P2 SSRF ::ffff: 补丁对 WHATWG 归一化形同死代码**——URL 把 `[::ffff:169.254.169.254]` 归一化成十六进制 `[::ffff:a9fe:a9fe]`,「剥前缀+点分正则」生产走不到→元数据/内网仍放行。所幸盲探无回显、输入须过相关性过滤,危害有限。 | host 以 `::ffff:` 开头一律拦,或把末两 hextet 还原成点分 IPv4 再判;补 `[::ffff:169.254.169.254]/[::ffff:10.0.0.1]` 回归用例。 |
| B3-4 低(修复未竟) | `trigger-sources.ts:44` | AI 路由「纯涨跌不触」护栏生产失效——判定吃 `title+retailTake`,模板 retailTake 注入领头 peer 的 AI 词(PLTR 的 peer 科大讯飞恒含「大模型」)→ 纯涨跌也弹「反误判」入口;单测只喂合成干净文本给虚假信心。 | 路由判定只用事件字段(title/triggerName),别吃 peer 派生文本;单测改真实模板 retailTake 输入。 |
| B3-5 低 | `admin/insights/route.ts:75` | publish 不校验 publishDoc 返回值——对 rejected/superseded 稿返 null,接口仍报 `{ok:true,status:"published"}` 且已覆盖打回稿 payload → 谎报「已发布」实则仍 rejected。 | publish 前按 doc.status 校验(非 draft/published 直接 409 并跳过 updatePayload)。 |
| B3-6 低 | `admin/insights/route.ts:90/96` | enforceReadonlyRelations 用 `getChain(prev.chainId)` 重算、validateDailyPayload 用 `getChain(payload.chainId)`,接口不断言两者一致;mappingsDelta[].segment 既不被 enforce 收敛也不被 schema 校验 → 留跨链改标签+伪造 segment 缝(仅 admin UI+飞书,不进公开页)。 | POST 断言 `payload.chainId===doc.payload.chainId`;enforce 一并重算 segment(segmentForCodeInChain);schema 增 `segment∈chain.segments`。 |
| B3-7 低(漏洞) | `trigger-sources.ts:28` | AI 关键词无词界锚定——`/AI/i` 命中拉丁词内 ai(gains/chain/retail/email),「智能体」是「智能体验」子串 → 普通软件股事件误路由,违模块自身注释。 | 英文 `(?<![A-Za-z])AI(?![A-Za-z])`;「智能体」加负向前瞻 `智能体(?!验|系|征)`。 |

## 第三批 · 优化(低)
- `trigger-sources.ts:29` AI_COMMERCIAL 召回偏低:`AI\s*(收入|订单)` 要求紧邻,「AI云收入/AI相关订单」隔开漏命中——放宽为 `AI[\s\S]{0,4}?(收入|营收|订单|付费|订阅|ARR|商业化)`,并把触发源 observation 纳入匹配文本。
- `BriefingFeed.tsx:752`+`ReasoningCards.tsx:12` DRY 没抽干净:首页事件卡 REL_LABEL_CLS、因果链卡 REL_CLS 仍是独立副本(与新真源逐字节相同),模块注释 overclaims——直接 import 新真源(键完全一致可直换),或缩小注释声称范围。
- `relation-rank.ts:32` REL_CHIP_CLS_SHORT 类型收窄成 `Record<string,string>`,丢 Relation 穷尽性检查(加第 5 档不补键仍编译过)——改回 `Record<Relation,string>` 或消费点补兜底色。

---

# 第四批评审(2026-07-05 · P1 统一关系模型,独立大批 46 文件 / 7551 插入)

> 评审对象:第三批修复(`a8e0d31`)之后一大批未评审的 **P1 统一关系模型** 工程——引入 `relation-resolver`(关系唯一读入口)、退旧「强/中/弱」双轨→`relationType`、审计化关系数据为单一核定源、加审阅台 / 准入 lint / 健康面板护栏。基线 `a8e0d31` → HEAD `0b478cf`。7 维度多智能体 + 对抗验证 + 人工抽验(28 候选→25 存活)。
> **核心结论:三不变量(单一读入口 / 双轨退干净 / 单一核定源)均为「文档达成、非代码达成」;合规红线基本守住;审阅台安全;但有 1 条 HIGH 发布阻断项,不能直接上生产。**

## 第四批 · P0 发布阻断(HIGH · 已人工实锤)

| # | 文件:行 | 问题 | 建议 |
|---|---|---|---|
| P1-0 HIGH | `chains.ts:44` + `stock/[code]/page.tsx:302`(+`Dashboard.tsx:82`) | **AI 主链所有个股「查看链」100% 404**——`CHAINS` 用 `id:"ai"`,chain-relations 的 chainId 是 `"ai-infra"`;个股页拼 `href=/chain/${primaryRel.chainId}=/chain/ai-infra`,而 `getChain=CHAINS[id]` → `CHAINS["ai-infra"]`=undefined → `notFound()`。中际旭创等 35+ 只 AI 股 + Dashboard 关联图谱链接全 404,电力链因 id 恰一致幸免。 | 加 chainId→路由 id 映射(ai-infra→ai),Dashboard 与 stock 页共用一处;或统一 chain-relations 的 AI chainId 为 "ai"。**上线前必修。(评审侧可代修:纯 bug 一行映射、不碰架构决策)** |

## 第四批 · 不变量未达成(重构核心目的没做到 · medium)

| # | 文件:行 | 问题 | 建议 |
|---|---|---|---|
| P1-1 | `generate.ts:279`+`chain/[id]/page.tsx:302`+`page.tsx:64`+`admin/insights/route.ts:118` | **双轨没退干净**——`relation.ts`(仅 INSIGHT_CHAINS 派生)仍是平行未审计源,被链页/首页/每日简报/admin **4 处直读**。29 个审计码(浪潮 000977=direct、光迅 002281=indirect)不在 insight → 这 4 处返 null 落「产业链相关」,而 /stocks、stock 页读审计源显「直接/间接」→ **同票跨面两套标签**,简报还可能漏掉审计核定受益股。resolver 头注自称「chain 页都走这里」被自己没接进去打脸。 | 把链页 roster、首页 relationLabelFor、简报 generate.ts 切到 resolver(resolveInChain/resolveRelationsForCode),切完删 relation.ts 旧读函数、修正 resolver 头注。 |
| P1-2 | `watch-relation.ts:30`+`Dashboard.tsx:1247`+`stocks/page.tsx:30` | **resolvePrimary 跨链取最强档 = B2-2 复发**——多链票(英维克 002837 / 盛弘 / 科士达 在 ai-infra=间接、power=直接)在自选卡/关联图谱/链筛选显「直接」,与 stock 页 `resolveInChain`(本链=间接)打架、档位被上抬;`/stocks` 选「AI链+间接」会把英维克错误剔除。 | 本链语义处先定锚链再 `resolveInChain`(与 stock 页一致),或按 chainId 存每链档位、前台按当前链渲染;同步更新 relation.ts:13-14 与链页那条已被违背的注释。 |
| P1-3 | `chain-relations.ts:144`+`:88` | **单一核定源名不副实**——section-1 从 insight 派生时无「审计 remove」排除:英维克/盛弘/科士达/东方电气跨链双计入 ai-infra+power,ai-application(金山办公 6 A股 + PLTR/NOW/SNOW)错挂「AI 推理基础设施链」,均与 v2-audited.csv 判 `action=remove` 相反,`:81-82` 注释已过期。 | section-1 加按审计 remove 列表(code\|chainId)的排除集,或从 insight-chains 删这些行;diagnostics 加「同 code 跨多链/渲染出现 remove 行」告警。 |
| P1-4 | `scripts/relation-lint.ts:1` | **护栏无强制准入门**——准入 lint / resolver-health / 关键样本三道全是纯手动脚本,未接 CI/pre-commit/package.json,注释宣称的「CI/回灌前跑非零退出」仓库里不存在。手改或数据管线派生出污染关系,git push main 直接部署、护栏一次未跑(refresh-data.yml 还自动 commit 生成物回 main 无关系门)。 | package.json 加 `check:relations`,接 GitHub Actions(过滤 chain-relations*/relation*)+ pre-push,失败即拦;修正注释假象。 |
| P1-5 | `resolver-diagnostics.ts:51`/`:43` | **health 检查结构性恒绿**——守核心不变量「daily 绝不自动升 relationType」的检查里 `resolvedSource` 硬编码 'static'、`getDailySignals` 恒返 []、date 硬编码历史日、dups 去重后必空 → 面板永远全绿、永远无法失败,虚假保证。 | 改比对 resolved 后 relationType 与 static 档位是否一致、date 用运行时当天并透传;补跨链一致性检查;骨架期占位项显式标注「非活跃保证」。 |

## 第四批 · 数据一致性 / 合规卫生(low)

- `stock/[code]:186` **fallback 按边强度反推「直接映射」**——审计源无该 peer 时用 chainEdges 强/中/弱硬映射成 direct/indirect rose chip(30+ 条),无可回溯证据,擦边「分级需可回溯证据」红线。建议:未覆盖 peer 显「待验证/未纳入覆盖」,strength 仅内部排序不进徽章。
- `watch-relation.ts:22` **weak 折叠不一致**——自选卡显「情绪映射」,/stocks 和 stock 页显「弱映射」,同票跨面两档(中国核电 601985 等)。
- `chain-relations-audit.generated.ts:1` **不可复现**——声称 AUTO-GENERATED 但仓库无生成脚本,约 180/210 行(含所有 remove 判定)只在 CSV 是文档、非运行时源。建议补 `scripts/gen-chain-relations-audit.mjs` 接 data-check(生成物 vs 提交物比对)。
- `insight-chains.ts:175` **残留「龙头/二线」话术** 经派生到 stock 页展示(浪潮/工业富联/盛弘「二线」等)——**注:铁律未破**(仍按传导距离非龙头分级),话术卫生,建议回灌改中性 + lint 拦「龙头/二线」。
- `relation-lint.ts:44` lint 只扫 reason、不扫 verificationPoints/references(前台会展示的字段可绕过合规门);`chain-relations.ts:243` REASON_APPEND 拼样板文让「概念词无证据」检查自我满足;`relation-review/export/route.ts:24` CSV 公式注入(端点已 admin 鉴权、受害者限负责人本机);`relation-rank.ts:36` REL_RANK 3-4 处副本;`stock/[code]:148` peer 排序按隐藏边强度与徽章不同源。

## 第四批 · 整体结论
三不变量均未真达成(relation.ts 4 处直读平行源、审计 remove 未落运行时、护栏无 CI 门、health 恒绿)——「单一读入口+双轨退干净+单一核定源」目前是**文档达成而非代码达成**。**合规红线基本守住**(无买卖/目标价/涨跌预测,分级按传导距离非龙头),残留是 low 卫生问题非喊单事故。**审阅台安全**(端点鉴权、readonly 守住、无越权改档)。**但有真回归、不能直接上生产**:先修 AI 链 404(P0),再收敛 relation.ts + 统一跨链口径 + 护栏接 CI,方可宣称不变量达成并放行。

---

## 附:未采纳/驳回的候选(供参考,不必处理)
四批共 112+ 候选,经对抗验证驳回约 17 条(行号对不上 / 场景不可达 / 已有兜底 / 属文档已接受的设计),已剔除。上表为存活项。人工抽验累计确认:第二批两条 HIGH(title 未过护栏、relation 跨链越级)+ briefing-backup insight 无超时 fetch;第三批两条合规(content-guard「成」净回归、admin 发布侧缺 content-guard);第四批 HIGH 404(chainId「ai-infra」≠路由「ai」)+ resolvePrimary 跨链取最强档(B2-2 复发)均属实。
