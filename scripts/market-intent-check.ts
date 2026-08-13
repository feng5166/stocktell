// Market Intent 规则引擎防漂移检查(2.2.2)。fixtures/market-intent/cases.json 每例:
// 原始指标 → classifyIntent → 断言 intent/confidence 精确一致 + 证据/反证包含关键句。
// 规则/阈值改动导致判定变化 → 本脚本红 → 有意改判须同 commit 更新 fixture 随评审(V9 同款流程)。
// 另做覆盖面断言:8 档意图每档至少 1 例——新加意图档必须带样本,防"加了档没人测"。
// 用法:npx tsx scripts/market-intent-check.ts(已聚合进 npm run check:relations)
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { classifyIntent, INTENT_LABEL } from "../src/lib/market-intent/rules";
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

if (errors.length) {
  console.error(`✗ Market Intent 规则检查 ${errors.length} 处失败:`);
  for (const e of errors) console.error("  " + e);
  console.error("\n有意改规则:同 commit 更新 fixtures/market-intent/cases.json 并在 commit message 说明判定变化。");
  process.exit(1);
}
console.log(`✅ Market Intent 规则检查全过(${cases.length} 例,8 档意图全覆盖)`);
