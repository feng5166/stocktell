// Market Intent 规则引擎防漂移检查(2.2.2)。fixtures/market-intent/cases.json 每例:
// 原始指标 → classifyIntent → 断言 intent/confidence 精确一致 + 证据/反证包含关键句。
// 规则/阈值改动导致判定变化 → 本脚本红 → 有意改判须同 commit 更新 fixture 随评审(V9 同款流程)。
// 另做覆盖面断言:8 档意图每档至少 1 例——新加意图档必须带样本,防"加了档没人测"。
// 用法:npx tsx scripts/market-intent-check.ts(已聚合进 npm run check:relations)
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { classifyIntent, INTENT_LABEL } from "../src/lib/market-intent/rules";
import { computeJudgmentChanges } from "../src/lib/judgment-diff";
import type { ChainJudgment } from "../src/lib/judgment";
import type { IntentType, SegmentDayMetrics } from "../src/lib/market-intent/types";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const file = path.join(ROOT, "fixtures/market-intent/cases.json");

interface Case {
  name: string;
  note?: string;
  metrics: SegmentDayMetrics;
  expected: {
    intent: IntentType;
    confidence: "high" | "medium" | "low";
    evidenceIncludes?: string[];
    counterEvidenceIncludes?: string[];
  };
}

const { cases } = JSON.parse(fs.readFileSync(file, "utf8")) as { cases: Case[] };
const errors: string[] = [];
const covered = new Set<IntentType>();

for (const c of cases) {
  const got = classifyIntent(c.metrics);
  covered.add(got.intent);
  const tag = `[${c.name}]`;
  if (got.intent !== c.expected.intent)
    errors.push(`${tag} intent 漂移:期望 ${c.expected.intent},实际 ${got.intent}`);
  if (got.confidence !== c.expected.confidence)
    errors.push(`${tag} confidence 漂移:期望 ${c.expected.confidence},实际 ${got.confidence}`);
  if (got.label !== INTENT_LABEL[got.intent])
    errors.push(`${tag} label 与 INTENT_LABEL 不一致`);
  if (got.evidence.length === 0) errors.push(`${tag} evidence 为空(判定必须带证据)`);
  const ev = got.evidence.join("\n");
  for (const s of c.expected.evidenceIncludes ?? [])
    if (!ev.includes(s)) errors.push(`${tag} evidence 缺关键句「${s}」\n  实际:${ev.replace(/\n/g, " / ")}`);
  const ce = got.counterEvidence.join("\n");
  for (const s of c.expected.counterEvidenceIncludes ?? [])
    if (!ce.includes(s)) errors.push(`${tag} counterEvidence 缺关键句「${s}」\n  实际:${ce.replace(/\n/g, " / ") || "(空)"}`);
}

const ALL: IntentType[] = ["accumulation", "rush", "wash", "distribution", "exit", "divergence", "exhaustion", "neutral"];
for (const t of ALL) if (!covered.has(t)) errors.push(`覆盖面:意图档 ${t} 没有任何 fixture 命中`);

// ---- 2.2.6 Change Detection 纯函数断言(computeJudgmentChanges 防漂移)----
{
  const base = {
    ymd: "20260813", chainSlug: "ai-infra", chainName: "AI 算力", href: "#",
    logic: "unchanged", intent: "divergence", intentLabel: "分歧",
    confidence: "中等置信度", confidenceRaw: "medium", segmentName: null,
    verification: "none", hasEvent: false, headline: "", body: "", take: "", splitNote: null, rank: 5,
  } as unknown as ChainJudgment;
  const today = {
    ...base, ymd: "20260814", intent: "distribution", intentLabel: "派发特征",
    verification: "partial", hasEvent: true, confidenceRaw: "high", confidence: "较高置信度",
  } as typeof base;
  const c1 = computeJudgmentChanges(base, today);
  if (c1.length !== 3) errors.push(`diff:意图+验证+trigger 三变应报 3 项,实际 ${c1.length}(${c1.map((c) => c.field).join(",")})`);
  if (!c1.some((c) => c.field === "intent" && c.text.includes("分歧") && c.text.includes("派发特征")))
    errors.push("diff:intent 变化文案缺 from→to");
  if (c1.some((c) => c.field === "confidence")) errors.push("diff:medium→high 不是明显变化,不应报 confidence");
  if (computeJudgmentChanges(base, { ...base, ymd: "20260814" } as typeof base).length !== 0)
    errors.push("diff:无变化应报 0 项");
  if (computeJudgmentChanges(null, today).length !== 0) errors.push("diff:无历史应报 0 项(不误报首日)");
  const c2 = computeJudgmentChanges({ ...base, confidenceRaw: "low" } as typeof base, { ...base, ymd: "20260814", confidenceRaw: "high", hasEvent: false } as typeof base);
  if (!(c2.length === 1 && c2[0].field === "confidence")) errors.push(`diff:low→high 应只报 confidence 明显上升,实际 ${JSON.stringify(c2.map((c) => c.field))}`);
}

if (errors.length) {
  console.error(`✗ Market Intent 规则检查 ${errors.length} 处失败:`);
  for (const e of errors) console.error("  " + e);
  console.error("\n有意改规则:同 commit 更新 fixtures/market-intent/cases.json 并在 commit message 说明判定变化。");
  process.exit(1);
}
console.log(`✅ Market Intent 规则检查全过(${cases.length} 例,8 档意图全覆盖)`);
