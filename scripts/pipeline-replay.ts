// Pipeline Replay Harness v2(2026-07-05 负责人拍板:回放替代等真实交易日,周二只做生产 canary)。
//
// 用法:
//   pnpm pipeline:replay --date=2026-07-02 --mode=full                       # Case C 兜底路径(默认 llm=off)
//   pnpm pipeline:replay --date=2026-07-02 --mode=full --llm=on              # Case A' 全真彩排(真 LLM+博查,花钱)
//   pnpm pipeline:replay --date=2026-07-06 --mode=market-closed              # Case B 美股休市(07-06 场景)
//   pnpm pipeline:replay --date=2026-07-02 --mode=compliance-block           # Case D 合规阻断注入(零网络,PR 门禁)
//   pnpm pipeline:replay --date=2026-07-06 --mode=holiday-bridge             # Case F 节后首日观察(零网络,PR 门禁)
//
// v2 相对 v1:真回放 generate——历史行情来自东财日 K(us-history.usDailyBars),findMovers/generateDrafts
// 接受 ReplayEnv 注入(历史行情快照+回放日 07:00 锚点);insight 走 itemsOverride 内存直灌。
// 全链路 = findMovers → generateDrafts → briefStatus 判定 → generateDailyInsight → runGuards。
//
// 【dry-run 是结构性的】:本脚本只调 generateDrafts / generateDailyInsight——两者都不写库不发布
// (写库/发布在 cron route 层,本脚本不 import)。--dry-run 标志仅作显式声明。
//
// 状态口径(负责人 2026-07-06 拍板写死,docs/pipeline-replay.md §状态口径同源):
//   generated      = LLM 全真产出;
//   fallback       = LLM 挂但模板兜底成功(engine=template / confidence=低 / 进入人工审),【不是 failed】;
//   failed         = 只给地板故障(行情源/数据底座/结构性异常导致无法产出);
//   blocked        = 合规命中;
//   market_closed  = 美股休市。
// --llm=off 的 full 即 Case C(兜底路径)。不得把 LLM 挂等同于 failed。
import { existsSync, readFileSync } from "fs";
import { join } from "path";
import { scanSourceLeakage } from "./leakage-rules";

/* ---------- 参数 ---------- */
const args = process.argv.slice(2);
const getArg = (k: string) => args.find((a) => a.startsWith(`--${k}=`))?.split("=")[1];
const date = getArg("date") ?? "";
const mode = (getArg("mode") ?? "full") as
  | "full"
  | "market-closed"
  | "compliance-block"
  | "holiday-bridge";
const llm = (getArg("llm") ?? "off") as "on" | "off";
if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
  console.error("必须指定 --date=YYYY-MM-DD(回放的业务日期)");
  process.exit(2);
}

/* ---------- env:先载 .env.local,再按 --llm 裁剪,然后才动态 import 业务模块 ---------- */
function loadEnvLocal() {
  const p = join(process.cwd(), ".env.local");
  if (!existsSync(p)) return;
  for (const line of readFileSync(p, "utf8").split("\n")) {
    const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
    if (!m || line.trim().startsWith("#")) continue;
    const v = m[2].replace(/^["']|["']$/g, "");
    if (!(m[1] in process.env)) process.env[m[1]] = v;
  }
}
loadEnvLocal();
if (llm === "off") {
  // 无 key → generateDrafts 走 template、genJudgment/genHeat 走规则兜底、references 跳过检索
  delete process.env.LLM_API_KEY;
  delete process.env.LLM_FALLBACK_API_KEY;
  delete process.env.BOCHA_API_KEY;
  // 兜底路径同时免 URL HEAD 探测(references 保持 verified=false):compliance-block 作 PR 门禁零网络,
  // full/market-closed 兜底回放不受外站可达性抖动影响。--llm=on 全真彩排仍走真实探测。
  process.env.INSIGHT_SKIP_URL_VERIFY = "1";
}

/* ---------- 断言收集 ---------- */
const assertions: Array<{ name: string; pass: boolean; got?: string }> = [];
function expect(name: string, pass: boolean, got?: unknown) {
  assertions.push({ name, pass, got: got === undefined ? undefined : String(got) });
}

/* ---------- source-leakage(规则单一源:scripts/leakage-rules.ts,与 CLI 共用防 drift)---------- */
function sourceLeakage() {
  const hits = scanSourceLeakage();
  return { hits: hits.length, files: Array.from(new Set(hits.map((h) => h.file))) };
}

(async () => {
  /* ---------- 动态 import(env 定型后)---------- */
  const { STOCKS } = await import("../src/data/stocks");
  const { usDailyBars } = await import("../src/lib/us-history");
  const { usDailyCloses } = await import("../src/lib/yahoo");
  const { generateDrafts } = await import("../src/lib/generate");
  const { generateDailyInsight } = await import("../src/lib/insight-pipeline/generate");
  const { CHAINS } = await import("../src/data/chains");
  const { resolveInChain, resolvePrimary, resolveInChainLabel } = await import("../src/lib/relation-resolver");
  const { relationForCodeInChain } = await import("../src/lib/relation");
  const { INSIGHT_CHAINS } = await import("../src/data/insight-chains");
  type BriefingItem = import("../src/lib/briefings").BriefingItem;
  type Quote = import("../src/lib/quotes").Quote;

  /* ---------- 回放行情:东财历史日 K → Quote 快照 ---------- */
  // 隔夜口径:北京 date 日 07:00 能看到的最新美股收盘 = 最后一根 date' < date 的 bar。
  // 【探针集是显式清单不是位置切片】(review F9):slice(0,12) 会被 stocks.ts 重排/插新票静默
  // 换掉——新上市薄历史票 bars<2 直接 miss,12 样本分母下几只就触发 DATA_UNAVAILABLE 假红。
  // 清单标准:长上市、高流动、多行业分散(休市判定是日历级,谁都行,要的是"一定有 250 根 K")。
  const MARKET_PROBE = ["NVDA", "MSFT", "AAPL", "GOOGL", "AMZN", "META", "TSLA", "AVGO", "AMD", "ORCL", "ANET", "ETN"];
  async function buildReplayQuotes(): Promise<{
    quotes: Record<string, Quote>;
    misses: string[];
    universe: number;
    expired: string[]; // 样本日超出 K 线窗口的票(bars 拿到了但 date 之前没有 bar)
  }> {
    const usAll = STOCKS.filter((s: { market: string }) => s.market === "美股");
    // market-closed 只验【日历级】新鲜度(freshestUS vs 最近美东工作日,全美股同一交易日历),
    // 不需要全池——12 票探针集把请求量压到限流阈值下(2026-07-06 nightly 二跑实测:全量 71 请求
    // 即使隔 60s 仍被东财限流)。full 模式仍全量(要真实 movers)。
    const probe = usAll.filter((s: { code: string }) => MARKET_PROBE.includes(s.code));
    const usStocks = mode === "market-closed" && probe.length >= 8 ? probe : mode === "market-closed" ? usAll.slice(0, 12) : usAll;
    const quotes: Record<string, Quote> = {};
    const expired: string[] = [];
    // review F8:「样本日超出 ~250 根 K 线窗口」(bars 在手但 date 前无 bar)≠「行情源不可达」。
    // 混成一个 false 会在样本日老化后(约 2027 年中)让 nightly 以误导性 DATA_UNAVAILABLE 永久红,
    // 把值班引向限流排查。分开计数,上层按占比出 SAMPLE_DATE_EXPIRED。
    const tryFetch = async (code: string): Promise<"ok" | "miss" | "expired"> => {
      // 主源东财;miss(限流/封机房 IP)逐票回退 Yahoo(仓库既有选择:新浪同样封机房 IP、
      // 腾讯美股覆盖不全,见 src/lib/yahoo.ts 头注释)。两源都挂才算 miss。
      let bars = await usDailyBars(code).catch(() => null);
      if (!bars || bars.length < 2) bars = await usDailyCloses(code).catch(() => []);
      if (!bars || bars.length < 2) return "miss";
      let toIdx = -1;
      for (let j = bars.length - 1; j >= 0; j--) {
        if (bars[j].date < date) { toIdx = j; break; }
      }
      if (toIdx < 1) return "expired"; // 数据拿到了,但样本日早于窗口起点 → 是样本老化不是源故障
      const to = bars[toIdx];
      const prev = bars[toIdx - 1];
      quotes[code] = {
        price: to.close,
        change: Math.round((to.close / prev.close - 1) * 10000) / 100,
        asOf: to.date,
      };
      return "ok";
    };
    const sweep = async (codes: string[], conc: number): Promise<string[]> => {
      const misses: string[] = [];
      for (let i = 0; i < codes.length; i += conc) {
        await Promise.all(
          codes.slice(i, i + conc).map(async (c) => {
            const r = await tryFetch(c);
            if (r === "expired" && !expired.includes(c)) expired.push(c);
            if (r !== "ok") misses.push(c);
          })
        );
      }
      return misses;
    };
    // 首轮并发 6;部分 miss=瞬时抖动 → 停 1.5s 低并发重试一轮。>50% miss=源级断供(限流/断网,
    // 2026-07-06 nightly 首跑实测:第二步 71/71 全 miss),重试无意义且会拖爆超时(每票 3 市场×6s),
    // 直接返回由上层报 DATA_UNAVAILABLE / SAMPLE_DATE_EXPIRED。
    let misses = await sweep(usStocks.map((s: { code: string }) => s.code), 6);
    if (misses.length && misses.length <= usStocks.length / 2) {
      await new Promise((r) => setTimeout(r, 1500));
      expired.length = 0; // 重试轮重新统计,避免双计
      misses = await sweep(misses, 2);
    }
    return { quotes, misses, universe: usStocks.length, expired };
  }

  const draftsToItems = (drafts: Array<Record<string, unknown>>): BriefingItem[] =>
    drafts.map((d, i) => ({
      ...(d as unknown as BriefingItem),
      id: `replay-${i}`,
      status: "published" as const,
      createdAt: `${date}T07:05:00+08:00`,
    }));

  /* ---------- 主链路 ---------- */
  let marketStatus = "unknown";
  let briefStatus = "unknown";
  let engine = "-";
  let eventCount = 0;
  let quoteMisses: string[] = [];
  const insights: Array<Record<string, unknown>> = [];

  if (mode === "compliance-block") {
    // Case D:带禁词的 fixture 条目走【真实 generateDailyInsight 全链路】——
    // triggerName 会流入 trigger.summary 与 mappingsDelta.todayWhy(guard 扫的散文),应被阻断。
    const fixture: BriefingItem[] = [
      {
        id: "fixture-compliance-1",
        date,
        impact: "高",
        title: "英伟达隔夜异动(合规阻断 fixture)",
        triggerCode: "NVDA",
        // 2.1-W3 扩表后 fixture 同步覆盖新词(强受益/有效信号),CI 一并验新表生效
        triggerName: "英伟达,建议满仓抄底,强受益有效信号",
        triggerChange: 5.2,
        beneficiaries: [{ code: "300308", name: "中际旭创" }],
        retailTake: "fixture",
        sourceUrl: null,
        status: "published",
        createdAt: `${date}T07:05:00+08:00`,
      },
    ];
    const r = await generateDailyInsight("ai", date, { itemsOverride: fixture });
    insights.push({
      chain: "ai",
      ok: r.ok,
      blocked: r.blocked ?? false,
      blockers: r.guard?.blockers ?? [],
      warnings: r.guard?.warnings ?? [],
    });
    // 口径:合规命中 = blocked(Case D 的 status 本身就是被验对象)
    briefStatus = r.blocked ? "blocked" : "NOT_BLOCKED(红线)";
    marketStatus = "n/a(fixture)";
    expect("Case D:HIGH 风险被阻断(blocked=true)", r.blocked === true, `blocked=${r.blocked}`);
    expect(
      "Case D:blocked reason 含禁词命中(admin 可见)",
      (r.guard?.blockers ?? []).some((b: string) => b.includes("禁词")),
      (r.guard?.blockers ?? []).join(" | ")
    );
  } else if (mode === "holiday-bridge") {
    // Case F:节后首日观察(2.1-C,零网络零 DB)。buildHolidayBridge 是纯函数,素材注入式——
    // fixture 模拟「最近有效交易日(date 前一交易日)的已发布简报」,断言四件事:
    // ①口径不伪装(标题/声明写明无新隔夜映射,status=market_closed+subType,绝非 generated)
    // ②不硬造(recap 全部来自 fallbackFromDate 素材,无当日新事件)
    // ③guard 纵深有效(干净素材 0 blockers;禁词素材必须被拦)
    // ④宁缺勿造(无素材→不出 bridge)
    const { buildHolidayBridge, BRIDGE_TITLE } = await import("../src/lib/holiday-bridge");
    const { FALLBACK_SEGMENT } = await import("../src/data/chains");
    const fallbackFromDate = "2026-07-02"; // 与 Case B 样本日同族:07-06 休市,最近有效=07-02
    const recapFixture: BriefingItem[] = [
      {
        id: "fixture-bridge-1",
        date: fallbackFromDate,
        impact: "高",
        // 带涨跌百分比——生产模板题的真实形态(review F1:回顾标题是已过审事实记录,
        // 只扫禁词不扫数字红线;此 fixture 即"桥不被自己的合规扫描杀死"的回归哨)
        title: "英伟达隔夜上涨 3.10%,算力链关注度提升",
        triggerCode: "NVDA",
        triggerName: "英伟达",
        triggerChange: 3.1,
        beneficiaries: [{ code: "300308", name: "中际旭创" }],
        retailTake: "fixture",
        sourceUrl: null,
        status: "published",
        createdAt: `${fallbackFromDate}T07:05:00+08:00`,
      },
      {
        id: "fixture-bridge-2",
        date: fallbackFromDate,
        impact: "中",
        title: "Eaton 隔夜走强,数据中心电力链情绪回暖",
        triggerCode: "ETN",
        triggerName: "Eaton",
        triggerChange: 2.2,
        beneficiaries: [{ code: "002837", name: "英维克" }],
        retailTake: "fixture",
        sourceUrl: null,
        status: "published",
        createdAt: `${fallbackFromDate}T07:05:00+08:00`,
      },
    ];
    const doc = buildHolidayBridge({ date, fallbackFromDate, recapItems: recapFixture });
    marketStatus = "us_closed(fixture)";
    briefStatus = doc && doc.guard.blockers.length === 0 ? "market_closed+holiday_bridge" : "market_closed";
    expect("Case F:bridge 生成(素材在→doc 在)", doc !== null, doc ? "built" : "null");
    expect(
      "Case F:标题=节后首日观察(不伪装成简报/generated)",
      doc?.title === BRIDGE_TITLE,
      doc?.title
    );
    expect(
      "Case F:口径声明含「无新的隔夜美股映射」",
      (doc?.note ?? "").includes("无新的隔夜美股映射"),
      (doc?.note ?? "").slice(0, 40)
    );
    expect(
      "Case F:recap 全部来自 fallbackFromDate(不硬造当日事件)",
      doc?.recap.length === recapFixture.length && doc?.fallbackFromDate === fallbackFromDate,
      `recap=${doc?.recap.length},from=${doc?.fallbackFromDate}`
    );
    expect(
      "Case F:链观察含验证点(非空且不含兜底段)",
      (doc?.chainWatch.length ?? 0) > 0 &&
        (doc?.chainWatch ?? []).every(
          (cw) => cw.segments.length > 0 && cw.segments.every((s) => s.verify.length > 0 && s.name !== FALLBACK_SEGMENT)
        ),
      `chains=${doc?.chainWatch.length}`
    );
    expect(
      "Case F:回顾标题含涨跌百分比不自拦(事实记录只扫禁词,guard=0)",
      doc?.guard.blockers.length === 0,
      (doc?.guard.blockers ?? []).join("|") || "0"
    );
    // 反向:禁词素材必须被 guard 纵深拦下(未来接 LLM 假期消息时这道闸就是防线)
    const dirty = buildHolidayBridge({
      date,
      fallbackFromDate,
      recapItems: [{ ...recapFixture[0], title: "英伟达大涨,建议满仓抄底" }],
    });
    expect(
      "Case F:禁词素材被 guard 拦(blockers 非空)",
      (dirty?.guard.blockers.length ?? 0) > 0,
      (dirty?.guard.blockers ?? []).join("|")
    );
    // 宁缺勿造:无素材不出 bridge
    const empty = buildHolidayBridge({ date, fallbackFromDate, recapItems: [] });
    expect("Case F:无素材→不出 bridge(宁缺勿造)", empty === null, empty ? "built(红线)" : "null");
  } else {
    // full / market-closed:真回放 generate
    const { quotes, misses, universe, expired } = await buildReplayQuotes();
    quoteMisses = misses;
    // 数据地板 guard:行情源不可达(限流/断网)时【不】拿空数据断言休市语义——那会把"harness 取数失败"
    // 误报成"管线判定错误"(空 quotes → freshestUS=undefined → 误判 open+failed)。按口径:failed/
    // DATA_UNAVAILABLE 只给地板故障,红但原因一眼可读。
    // review F8:样本日老化(出 250 根 K 窗口)单独出 SAMPLE_DATE_EXPIRED——那是"换样本日"
    // 的维护动作,不是限流排查,verdict 必须把人指对方向。
    if (misses.length > universe / 2) {
      const expiredDominant = expired.length >= misses.length / 2;
      console.log("=== Pipeline Replay Snapshot ===");
      console.log(JSON.stringify({
        date, mode, llm, dryRun: true,
        verdict: expiredDominant
          ? `SAMPLE_DATE_EXPIRED(样本日 ${date} 超出历史 K 线窗口:expired ${expired.length}/${universe}。请按 docs/pipeline-replay.md 换新样本日并同步 relations-check.yml / replay-nightly.yml)`
          : `DATA_UNAVAILABLE(行情源不可达/限流:miss ${misses.length}/${universe})`,
        quoteMisses: misses.slice(0, 12),
        expiredCodes: expired.slice(0, 12),
      }, null, 2));
      process.exit(1);
    }
    const replay = { quotes, now: new Date(`${date}T07:00:00+08:00`) };
    const g = await generateDrafts({ date, replay });
    engine = g.engine;
    eventCount = g.drafts.length;
    marketStatus = g.usMarketClosed ? "us_closed" : "open";
    // briefStatus 口径(负责人 2026-07-06 拍板):market_closed=休市;generated=LLM 全真产出;
    // fallback=LLM 挂但模板兜底成功(≠failed);failed 只给地板故障(交易日 0 条产出=行情/底座异常)。
    briefStatus = g.usMarketClosed
      ? "market_closed"
      : g.drafts.length === 0
        ? "failed"
        : engine === "llm"
          ? "generated"
          : "fallback";

    if (g.drafts.length > 0) {
      const items = draftsToItems(g.drafts as unknown as Array<Record<string, unknown>>);
      const configured = Object.values(CHAINS).filter(
        (c: { segments?: unknown[] }) => c.segments?.length
      ) as Array<{ id: string; name: string }>;
      for (const chain of configured) {
        const r = await generateDailyInsight(chain.id, date, { itemsOverride: items });
        insights.push({
          chain: chain.id,
          ok: r.ok,
          blocked: r.blocked ?? false,
          confidence: r.payload?.confidence,
          mappings: r.payload?.mappingsDelta.length ?? 0,
          blockers: r.guard?.blockers ?? [],
          warnings: r.guard?.warnings ?? [],
          reason: r.reason,
        });
      }
    }

    if (mode === "full") {
      const tag = llm === "on" ? "Case A'(全真)" : "Case C(兜底)"; // llm=off 的 full 即 Case C
      expect(`${tag}:美股为交易日(marketStatus=open)`, marketStatus === "open", marketStatus);
      expect(`${tag}:count>0(简报有产出)`, eventCount > 0, `count=${eventCount}`);
      if (llm === "on") {
        expect(
          "Case A':全真路径(engine=llm,status=generated)",
          engine === "llm" && briefStatus === "generated",
          `engine=${engine},status=${briefStatus}`
        );
      } else {
        expect(
          "Case C:LLM 挂→模板兜底(engine=template,status=fallback,非 failed)",
          engine === "template" && briefStatus === "fallback",
          `engine=${engine},status=${briefStatus}`
        );
      }
      const okInsights = insights.filter((i) => i.ok && !i.blocked);
      expect(`${tag}:生成 insight ≥1 且未被阻断`, okInsights.length >= 1, `ok=${okInsights.length}/${insights.length}`);
      if (llm === "off") {
        expect(
          "Case C:兜底 insight 置信=低(不伪装确定性)",
          okInsights.every((i) => i.confidence === "低"),
          okInsights.map((i) => String(i.confidence)).join(",") || "-"
        );
      }
    } else {
      expect("Case B:usMarketClosed=true", marketStatus === "us_closed", marketStatus);
      expect("Case B:count=0(不硬造隔夜映射)", eventCount === 0, `count=${eventCount}`);
      expect("Case B:status=market_closed(非 failed)", briefStatus === "market_closed", briefStatus);
      expect("Case B:insight 不硬造(0 条输入即跳过)", insights.length === 0, `insights=${insights.length}`);
    }
  }

  /* ---------- Case E:关系冲突样本(带预期断言)---------- */
  const samples = {
    yingweikeAiInfra: resolveInChain("002837", "ai-infra") ? "found" : "not_found",
    yingweikePower: resolveInChain("002837", "data-center-power")?.relationType ?? "not_found",
    kingsoftAiInfra: resolveInChain("688111", "ai-infra") ? "found" : "not_found",
    kingsoftAiApp: resolveInChain("688111", "ai-application")?.relationType ?? "not_found",
    langchaoAiInfra: resolvePrimary("000977")?.chainId === "ai-infra" ? resolvePrimary("000977")?.relationType : "not_ai-infra",
    zhongjiAiInfra: resolvePrimary("300308")?.chainId === "ai-infra" ? resolvePrimary("300308")?.relationType : "not_ai-infra",
    eatonTrigger: resolvePrimary("ETN")?.relationType ?? "not_found",
    beifanghuachuang: resolvePrimary("002371") ? "found" : "not_found",
  };
  expect("Case E:英维克不在 ai-infra", samples.yingweikeAiInfra === "not_found", samples.yingweikeAiInfra);
  expect("Case E:英维克电力链 direct", samples.yingweikePower === "direct", String(samples.yingweikePower));
  expect("Case E:金山不挂 ai-infra", samples.kingsoftAiInfra === "not_found", samples.kingsoftAiInfra);
  expect("Case E:浪潮 ai-infra direct", samples.langchaoAiInfra === "direct", String(samples.langchaoAiInfra));
  expect("Case E:中际旭创 ai-infra direct", samples.zhongjiAiInfra === "direct", String(samples.zhongjiAiInfra));
  expect("Case E:Eaton=trigger", samples.eatonTrigger === "trigger", String(samples.eatonTrigger));
  expect("Case E:北方华创不被旧源捞回", samples.beifanghuachuang === "not_found", samples.beifanghuachuang);

  /* ---------- 关系标签新旧 diff(切 resolver 回归哨)---------- */
  const SLUG_TO_CHAIN: Record<string, string> = {
    "ai-infra": "ai-infra",
    "datacenter-power": "data-center-power",
    "ai-application": "ai-application",
  };
  let parityTotal = 0, parityUnchanged = 0;
  const parityChanged: string[] = [];
  for (const ins of Object.values(INSIGHT_CHAINS) as Array<{ slug: string; mappings: Array<{ code?: string }> }>) {
    for (const m of ins.mappings) {
      if (!m.code) continue;
      parityTotal++;
      const oldL = relationForCodeInChain(m.code, ins.slug);
      const nowL = resolveInChainLabel(m.code, SLUG_TO_CHAIN[ins.slug]);
      if (oldL === nowL) parityUnchanged++;
      else parityChanged.push(`${m.code}[${ins.slug}] ${oldL ?? "∅"}→${nowL ?? "∅"}`);
    }
  }

  /* ---------- source-leakage ---------- */
  const leakage = sourceLeakage();
  expect("source-leakage=0(无旧源直读)", leakage.hits === 0, `hits=${leakage.hits}`);

  /* ---------- snapshot ---------- */
  const failed = assertions.filter((a) => !a.pass);
  const snapshot = {
    date,
    mode,
    llm,
    dryRun: true,
    marketStatus,
    briefStatus,
    engine,
    eventCount,
    insightCount: insights.filter((i) => i.ok && !i.blocked).length,
    insights,
    resolverSource: "resolver",
    sourceLeakage: leakage.hits,
    relationsChecked: samples,
    relationParity: { total: parityTotal, unchanged: parityUnchanged, changed: parityChanged },
    quoteMisses,
    compliance:
      mode === "compliance-block"
        ? assertions.filter((a) => a.name.startsWith("Case D") && a.pass).length === 2
          ? "blocked_as_expected"
          : "NOT_BLOCKED(红线)"
        : insights.some((i) => (i.blockers as string[])?.length) ? "blocked" : "passed",
    assertions: assertions.map((a) => `${a.pass ? "✅" : "❌"} ${a.name}${a.got !== undefined ? `(${a.got})` : ""}`),
    verdict: failed.length === 0 ? "PASS" : `FAIL(${failed.length})`,
  };
  console.log("=== Pipeline Replay Snapshot ===");
  console.log(JSON.stringify(snapshot, null, 2));
  process.exit(failed.length === 0 ? 0 : 1);
})().catch((e) => {
  console.error("replay 异常:", e);
  process.exit(1);
});
