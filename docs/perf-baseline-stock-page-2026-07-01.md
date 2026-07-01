# 个股详情页加载性能 · 基线(2026-07-01,优化前)

> 目的:记录优化前的实测基线,优化后用同一套用例复跑对比。
> 复跑:`bash scripts/perf-stock-page.sh`(默认打生产、5 只 A 股、每接口 3 轮)

## 测试用例(固定)
- 样本(均 A 股):`300308 中际旭创` / `601138 工业富联` / `688041 海光信息` / `688256 寒武纪` / `000977 浪潮信息`
- 测的模块(个股页真实加载链路):
  - `HTML壳`   `GET /stock/<code>` — ISR 静态壳,记 TTFB + 整页 total
  - `行情quotes` `GET /api/quotes?symbols=<code>` — LiveQuote
  - `基本面fund` `GET /api/fundamentals?code=<code>` — Fundamentals
  - `联动similar` `GET /api/similarity?code=<code>` — Similarity
- 深读 `/api/briefing/explain` 为点击按需,不计初始加载,不测。
- 浏览器里三个 API 并行;基线为拿干净单模块耗时顺序测。

## 基线数据(优化前,生产 www.stocktell.me,单位秒)

| 票 | HTML壳 TTFB / total | 行情quotes | 基本面fund | 联动similar |
|---|---|---|---|---|
| 300308 中际旭创(缓存热) | 1.0 / 2.66 | 0.87–1.85 | 1.32 | 0.97 |
| 601138 工业富联 | 0.88 / **9.04** | **5.91** | **14.45** | 1.62 |
| 688041 海光信息 | 0.84 / 1.06 | **5.98** | 0.88(已缓存) | 0.90 |
| 688256 寒武纪 | 0.96 / **9.18** | **5.89** | **14.43** | 1.46 |
| 000977 浪潮信息 | — | **5.88** | **14.42** | 1.97 |

**稳定性验证**:重复打同一只票,`quotes` 稳定 ~5.9s、`fundamentals` 稳定 ~14.4s、连打两次不下降 → 是"每次都撞固定超时",非冷/热缓存问题。

## 关键结论(优化目标)
| 模块 | 现状 | 判定 | 优化目标 |
|---|---|---|---|
| 行情 quotes | 每次 ~5.9s,且返回**过期缓存价** | ✗ 坏 | sub-second + 真实时价 |
| 基本面 fund(未缓存票) | ~14.4s,**超过前端 12s 中止 → 永远不显示** | ✗ 坏 | sub-second |
| 基本面 fund(已缓存票) | ~1s | ✓ | 保持 |
| HTML 壳(未缓存票整页) | ~9s(服务端 Tushare 撞 8s 上限) | ✗ 慢 | <2s |
| HTML 壳 TTFB | ~0.9s | ✓ | 保持 |
| 联动 similar | ~1–2s | ✓ | 保持 |

## 根因(按模块,基于硬证据)
- 部署默认区 = **香港 hkg1**(`VERCEL_REGION` 权威 + `x-vercel-id` 全 `sfo1::hkg1`)。→ "钉 hkg1"对二者**无效**(本就在香港)。
- **quotes(~5.9s,常态/每次)= 新浪按 IP 封 Vercel**:代码先打新浪→5s 后收 403(6/6 稳定)→才回落腾讯(腾讯 23–116ms 本来极快)。白白浪费 5s 在被封的新浪上。**这是持续问题。**
- **fundamentals(~14s,间歇性)= Vercel 香港↔阿里云北京 间歇性连接超时**:Tushare 在阿里云北京,多数 ~500ms(fundamentals 1–2s),但**偶发 connect-timeout 段**,此时 daily_basic 6s+1.5s+6s 双超时→null→不缓存→超过前端 12s 中止→**该票基本面此刻拿不到 + 触发一条飞书告警**。**同一路径也影响"为什么动"(博查,同在阿里云北京),会一起间歇性失败。**

## net-diag 实测(从 Vercel 香港区直连国内源)—— 硬证据
`VERCEL_REGION=hkg1`(权威确认默认区就是香港)。从该区直连:

| 源 | 结果 | 结论 |
|---|---|---|
| 新浪 hq.sinajs.cn | **HTTP 403 Forbidden,5064ms** | **新浪按 IP 封 Vercel**(慢速拒绝拖 5s) |
| 腾讯 qt.gtimg.cn(回落源) | HTTP 200,**77ms**,返回真实行情 | 腾讯正常极快 |
| Tushare api.tushare.pro(主机可达性) | HTTP 200,**505ms** | Tushare 主机不慢 |
| daily_basic(真 token,从 Vercel) | 多数 **code:0 真数据 ~500ms**;偶发 `UND_ERR_CONNECT_TIMEOUT` ~10s | fundamentals 时快时挂 |

**DNS**:`api.tushare.pro` 与 `api.bochaai.com` **同在阿里云北京**(`alb-*.cn-beijing.aliyuncsslb.com`);腾讯行情=腾讯云、新浪=新浪 IDC。
**抖动率(6 轮采样,Vercel→源)**:新浪 403×6(稳定封);腾讯 200×6(23–116ms);Tushare/博查 本轮 200×6(~500ms)——但另一轮两者**同时** connect-timeout ~10s。→ **Vercel 香港↔阿里云北京:多数好(~500ms)+ 间歇性连接超时(Tushare 与博查同进同退,是到阿里云北京的路径问题)**。
**复测佐证**:间歇窗口过后重测 /api/fundamentals(601138/688256/000977/002281/300394)= 0.9–2.0s 全正常 → 印证 fundamentals 的 14s 是**间歇性**,非常态。

**对照(沙箱,网络位置≈香港/亚洲,AS63981 HK)**:
- 新浪 `list=sh601138`:**HTTP 200,36ms**(vs Vercel 403)→ 坐实**新浪按 IP 封 Vercel**,非距离。
- daily_basic(真 token,同 app 调用):**HTTP 200,146ms,14 行数据** → token 有效/有积分/查询正确/Tushare 飞快。

**推翻的旧判断**:不是"香港够不着国内源"。区域=香港已确认;腾讯/Tushare 从香港都快。真凶按模块拆开(见下)。

## 优化方向(按两类问题分开,不是换区域)
1. **quotes(持续,新浪封 IP)**:代码**首选腾讯**(qt.gtimg.cn,实测 23–116ms 稳定)、把新浪降级为兜底或去掉。→ quotes 从 5.9s 直接 sub-second。改动小、收益确定。
2. **fundamentals + 为什么动(间歇,Vercel↔阿里云北京 抖动)**:
   - 治标:缩短 Tushare/博查单次超时(现 6s×2 太长)、失败快速回退,别让用户干等 12s;
   - 治本:把打阿里云北京(Tushare/博查)的活**挪到大陆侧**——大陆 VPS 定时抓全池基本面预热进 DB(fundamentals 本就有 DB 缓存,预热后 Vercel 永不现打),为什么动同理;Vercel 只读 DB → 稳定 sub-second、不受跨境抖动影响。

## 优化进展 / 复测对比
| 项 | 优化前 | 优化后 | 状态 |
|---|---|---|---|
| **行情 quotes** | ~5.9s(每次,新浪封 IP 拖 5s) | **~0.9s**(300308/601138/000977 实测 0.87–0.97s) | ✅ 已修(腾讯优先,`6871f86`,2026-07-02 生效确认) |
| 基本面 fund(间歇挂) | 抖动窗口 ~14s(超前端 12s→不显示) | 待做:SG VPS cron 预热 daily_basic 进 DB | ⏳ 待排期 |
| 为什么动(间歇挂) | 同阿里云北京抖动 | 待议:VPS 代理转发 vs 靠 whyCache | ⏳ 待议 |

**VPS 中继可行性(实测,2026-07-02)**:新加坡 VPS(47.84.8.167)→ Tushare 稳定 ~500ms(3/3),够当中继;新浪它也 403(无所谓,quotes 已走腾讯);内存紧(剩 ~278M),中继走轻量 cron。

## 复跑对比
优化上线后执行 `bash scripts/perf-stock-page.sh`,与本文件"基线数据"表逐格对比;重点看 quotes 与 fundamentals(未缓存票)是否从 ~6s/~14s 降到 sub-second。
