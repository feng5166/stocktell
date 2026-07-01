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

## 根因(硬证据,见下)
- 部署默认区 = **香港 hkg1**(`x-vercel-id` 全为 `sfo1::hkg1`,并由 `/api/admin/net-diag` 的 `VERCEL_REGION` 权威确认)。
- 故"钉 hkg1"对 quotes/fundamentals **无效**(本就在香港跑)。
- 真因:**新浪 `hq.sinajs.cn` / Tushare `api.tushare.pro` 从香港 Vercel 打不通/极慢**(quotes 撞 6s 超时吐过期缓存;fundamentals 6s+1.5s重试+6s≈14s 双超时→返回 null→不写缓存→每次重撞)。对照:博查(阿里云北京公有 API)香港能通。
- 硬证据由 `/api/admin/net-diag`(不钉区域、从默认区直连各源、20s 超时)给出 —— **见下方"net-diag 实测"**(待部署后回填)。

## net-diag 实测(从 Vercel 香港区直连国内源)
> 待 `/api/admin/net-diag` 部署后回填:各源 http/ms/是否超时。

（回填中…）

## 优化方向(不是换区域)
把"打国内源"挪到大陆侧:复用大陆 VPS 做定时抓取/中继,把行情+基本面预热进 DB,Vercel(香港)只读 DB → sub-second。详见后续方案。

## 复跑对比
优化上线后执行 `bash scripts/perf-stock-page.sh`,与本文件"基线数据"表逐格对比;重点看 quotes 与 fundamentals(未缓存票)是否从 ~6s/~14s 降到 sub-second。
