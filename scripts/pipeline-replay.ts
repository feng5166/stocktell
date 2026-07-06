// Pipeline Replay Harness v1(2026-07-05 负责人拍板:回放替代等真实交易日)。
// 用法:npx tsx scripts/pipeline-replay.ts --date=2026-07-06 [--mode=full|market-closed] [--dry-run]
//
// 【边界·诚实】generate.ts 的隔夜 movers 走实时行情(fetchQuotes 无历史)→ 本 harness【不真回放】
// 历史交易日的隔夜事件;真历史回放需"每日美股行情存档"(2.1)。本 harness 验证的是【date-agnostic /
// 可查历史】的环节,重点=关系标签新旧 diff(generate/admin 切 resolver 的命门验证)。
// LLM-fail(Case C)/compliance-blocked(Case D)需注入,v1 未做,周二真实 canary 兜底。
//
// dry-run:全程只读,不写生产库、不发布。默认 dry-run(要写库须显式去标,但本脚本压根不写)。
import { INSIGHT_CHAINS } from "../src/data/insight-chains";
import { relationForCodeInChain } from "../src/lib/relation";
import { resolveInChainLabel, resolvePrimary, resolveInChain } from "../src/lib/relation-resolver";
import { readdirSync, readFileSync, statSync } from "fs";
import { join } from "path";

const args = process.argv.slice(2);
const getArg = (k: string) => args.find((a) => a.startsWith(`--${k}=`))?.split("=")[1];
const date = getArg("date") || "(未指定)";
const mode = getArg("mode") || "full";
const dryRun = args.includes("--dry-run") || true; // v1 恒 dry-run:绝不写生产

// insight slug → chain-relations chainId
const SLUG_TO_CHAIN: Record<string, string> = {
  "ai-infra": "ai-infra",
  "datacenter-power": "data-center-power",
  "ai-application": "ai-application",
};

// ── 环节①:关系标签新旧 diff(切 resolver 命门)──────────────────────────
// 对每条 insight 映射(code, slug),比 old relationForCodeInChain vs new resolveInChainLabel。
// 显示切 generate/admin 到 resolver 后每个 code 的标签变化 —— 全部应是【预期】的
// (P1-3 移出=old有→new null;resolver 补齐=old null→new 有档)。
function relationParity() {
  const changed: Array<{ code: string; name?: string; slug: string; old: string | null; now: string | null; kind: string }> = [];
  let total = 0;
  let unchanged = 0;
  for (const ins of Object.values(INSIGHT_CHAINS) as Array<{ slug: string; mappings: Array<{ code?: string; name?: string }> }>) {
    const chainId = SLUG_TO_CHAIN[ins.slug];
    for (const m of ins.mappings) {
      if (!m.code) continue;
      total++;
      const oldLabel = relationForCodeInChain(m.code, ins.slug);
      const nowLabel = resolveInChainLabel(m.code, chainId);
      if (oldLabel === nowLabel) {
        unchanged++;
      } else {
        const kind =
          oldLabel && !nowLabel ? "移出(P1-3 remove)" : !oldLabel && nowLabel ? "补齐(resolver 覆盖)" : "改档";
        changed.push({ code: m.code, name: m.name, slug: ins.slug, old: oldLabel, now: nowLabel, kind });
      }
    }
  }
  return { total, unchanged, changedCount: changed.length, changed };
}

// ── 环节②:关系冲突样本(Case E)────────────────────────────────────────
function relationSamples() {
  return {
    yingweikeAiInfra: resolveInChain("002837", "ai-infra") ? "found(应 not_found)" : "not_found",
    yingweikePower: resolveInChain("002837", "data-center-power")?.relationType ?? "not_found",
    kingsoftAiInfra: resolveInChain("688111", "ai-infra") ? "found(应 not_found)" : "not_found",
    kingsoftAiApp: resolveInChain("688111", "ai-application")?.relationType ?? "not_found",
    langchaoAiInfra: resolvePrimary("000977")?.chainId === "ai-infra" ? resolvePrimary("000977")?.relationType : "not_ai-infra",
    zhongjiAiInfra: resolvePrimary("300308")?.chainId === "ai-infra" ? resolvePrimary("300308")?.relationType : "not_ai-infra",
    eatonTrigger: resolvePrimary("ETN")?.relationType ?? "not_found",
    beifanghuachuang: resolvePrimary("002371") ? "found(应 not_found)" : "not_found",
  };
}

// ── 环节③:source-leakage(旧源直读)────────────────────────────────────
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

// ── 环节④:市场日历 + insight(需运行时/DB,catch 降级)─────────────────
async function marketAndInsight() {
  const out: Record<string, unknown> = {};
  try {
    const { isAshareTradingDay } = await import("../src/lib/tushare");
    if (date !== "(未指定)") out.ashareTradingDay = await isAshareTradingDay(date);
  } catch (e) {
    out.ashareTradingDay = `unavailable(${String(e).slice(0, 40)})`;
  }
  try {
    const { getBriefStatus } = await import("../src/lib/brief-status");
    if (date !== "(未指定)") out.briefStatus = (await getBriefStatus(date))?.status ?? "no_record";
  } catch (e) {
    out.briefStatus = `db_unavailable`;
  }
  return out;
}

(async () => {
  const parity = relationParity();
  const snapshot = {
    date,
    mode,
    dryRun,
    generateReplay: "not_supported(实时行情,无历史存档;周二真实 canary 兜底)",
    ...(await marketAndInsight()),
    relationParity: { total: parity.total, unchanged: parity.unchanged, changed: parity.changedCount },
    relationSamples: relationSamples(),
    sourceLeakage: sourceLeakage(),
  };
  console.log("=== Pipeline Replay Snapshot ===");
  console.log(JSON.stringify(snapshot, null, 2));
  if (parity.changedCount > 0) {
    console.log("\n=== 关系标签切 resolver 的变化明细(应全部为预期)===");
    for (const c of parity.changed) console.log(`  ${c.code} ${c.name ?? ""} [${c.slug}] ${c.old ?? "∅"} → ${c.now ?? "∅"}  (${c.kind})`);
  }
})();
