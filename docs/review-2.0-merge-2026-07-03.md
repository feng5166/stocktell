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

## 附:未采纳/驳回的候选(供参考,不必处理)
两轮共 40+ 候选,经对抗验证驳回约 12 条(行号对不上 / 场景不可达 / 已有兜底 / 属文档已接受的设计),已剔除。上表为存活项。
