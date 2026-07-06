// Pipeline Replay Harness v2(2026-07-05 负责人拍板:回放替代等真实交易日,周二只做生产 canary)。
//
// 用法:
//   pnpm pipeline:replay --date=2026-07-02 --mode=full --dry-run            # Case A 正常美股交易日
//   pnpm pipeline:replay --date=2026-07-06 --mode=market-closed --dry-run   # Case B 美股休市(07-06 场景)
//   pnpm pipeline:replay --date=2026-07-02 --mode=compliance-block --dry-run # Case D 合规阻断注入
//   加 --llm=on 走真 LLM+博查(全真彩排,花钱);默认 off=规则兜底路径(快、免费、确定性)
//
// v2 相对 v1:真回放 generate——历史行情来自东财日 K(us-history.usDailyBars),findMovers/generateDrafts
// 接受 ReplayEnv 注入(历史行情快照+回放日 07:00 锚点);insight 走 itemsOverride 内存直灌。
// 全链路 = findMovers → generateDrafts → briefStatus 判定(镜像 cron)→ generateDailyInsight → runGuards。
//
// 【dry-run 是结构性的】:本脚本只调 generateDrafts / generateDailyInsight——两者都不写库不发布
// (写库/发布在 cron route 层,本脚本不 import)。--dry-run 标志仅作显式声明。
// Case C(LLM 失败)如实说明:管线设计=北极星每天必产出,LLM 挂 → 规则兜底(engine=template /
// confidence=低),【不是】failed;failed 只给地板故障(行情源挂/异常)。--llm=off 即验证该兜底路径。
import { readdirSync, readFileSync, statSync, existsSync } from "fs";
import { join } from "path";

/* ---------- 参数 ---------- */
const args = process.argv.slice(2);
const getArg = (k: string) => args.find((a) => a.startsWith(`--${k}=`))?.split("=")[1];
const date = getArg("date") ?? "";
const mode = (getArg("mode") ?? "full") as "full" | "market-closed" | "compliance-block";
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
}

/* ---------- 断言收集 ---------- */
const assertions: Array<{ name: string; pass: boolean; got?: string }> = [];
function expect(name: string, pass: boolean, got?: unknown) {
  assertions.push({ name, pass, got: got === undefined ? undefined : String(got) });
}

/* ---------- source-leakage(与 scripts/source-leakage.ts 同规则)---------- */
function sourceLeakage() {
  const OLD = /relationForCodeInChain|relationLabelFor|insightBundleForCode|segmentForCodeInChain|from ["']@\/lib\/relation["']/;
  const SKIP = /relation-resolver|relation-rank|relation-lint|watch-relation|chain-relations|resolver-diagnostics|source-leakage|pipeline-replay|[/\\]relation\.ts$/;
  const hits: string[] = [];
  const walk = (dir: string) => {
    for (const f of readdirSync(dir)) {
      const p = join(dir, f);
      if (statSync(p).isDirectory()) walk(p);
      else if (/\.(ts|tsx)$/.test(p) && !SKIP.test(p)) {
        readFileSync(p, "utf8").split("\n").forEach((line) => {
          const t = line.trim();
          if (OLD.test(line) && !t.startsWith("//") && !t.startsWith("*")) hits.push(p);
        });
      }
    }
  };
  walk("src");
  return { hits: hits.length, files: Array.from(new Set(hits)) };
}

(async () => {
  /* ---------- 动态 import(env 定型后)---------- */
  const { STOCKS } = await import("../src/data/stocks");
  const { usDailyBars } = await import("../src/lib/us-history");
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
  async function buildReplayQuotes(): Promise<{ quotes: Record<string, Quote>; misses: string[] }> {
    const usStocks = STOCKS.filter((s: { market: string }) => s.market === "美股");
    const quotes: Record<string, Quote> = {};
    const misses: string[] = [];
    const CONC = 6;
    for (let i = 0; i < usStocks.length; i += CONC) {
      await Promise.all(
        usStocks.slice(i, i + CONC).map(async (s: { code: string }) => {
          const bars = await usDailyBars(s.code).catch(() => null);
          if (!bars || bars.length < 2) return void misses.push(s.code);
          let toIdx = -1;
          for (let j = bars.length - 1; j >= 0; j--) {
            if (bars[j].date < date) { toIdx = j; break; }
          }
          if (toIdx < 1) return void misses.push(s.code);
          const to = bars[toIdx];
          const prev = bars[toIdx - 1];
          quotes[s.code] = {
            price: to.close,
            change: Math.round((to.close / prev.close - 1) * 10000) / 100,
            asOf: to.date,
          };
        })
      );
    }
    return { quotes, misses };
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
        triggerName: "英伟达,建议满仓抄底",
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
    briefStatus = "n/a(fixture)";
    marketStatus = "n/a(fixture)";
    expect("Case D:HIGH 风险被阻断(blocked=true)", r.blocked === true, `blocked=${r.blocked}`);
    expect(
      "Case D:blocked reason 含禁词命中(admin 可见)",
      (r.guard?.blockers ?? []).some((b: string) => b.includes("禁词")),
      (r.guard?.blockers ?? []).join(" | ")
    );
  } else {
    // full / market-closed:真回放 generate
    const { quotes, misses } = await buildReplayQuotes();
    quoteMisses = misses;
    const replay = { quotes, now: new Date(`${date}T07:00:00+08:00`) };
    const g = await generateDrafts({ date, replay });
    engine = g.engine;
    eventCount = g.drafts.length;
    marketStatus = g.usMarketClosed ? "us_closed" : "open";
    // briefStatus 判定镜像 cron/briefing:休市→market_closed;>0→generated;交易日 0 条→failed
    briefStatus = g.usMarketClosed ? "market_closed" : g.drafts.length > 0 ? "generated" : "failed";

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
      expect("Case A:美股为交易日(marketStatus=open)", marketStatus === "open", marketStatus);
      expect("Case A:count>0(简报有产出)", eventCount > 0, `count=${eventCount}`);
      expect("Case A:briefStatus=generated", briefStatus === "generated", briefStatus);
      const okInsights = insights.filter((i) => i.ok && !i.blocked);
      expect("Case A:生成 insight ≥1 且未被阻断", okInsights.length >= 1, `ok=${okInsights.length}/${insights.length}`);
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
