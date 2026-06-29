#!/usr/bin/env node
// AI 产业链股票池数据自检:防止数据越加越乱。
// 校验:① 重复 code ② sector 必须在 SECTORS 白名单 ③ relations/chainEdges 引用的标的都存在
//      ④ chainEdges 两端都在池内 ⑤ 统计孤儿(无任何关联,详情页会"暂无关联")
// 硬错误(①②③④)→ 退出码 1(CI 可拦);孤儿是指标(只报数,不失败)。
// 用法:node scripts/data-check.mjs   [--list 列出孤儿明细]
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (p) => fs.readFileSync(path.join(ROOT, p), "utf8");
const stocksSrc = read("src/data/stocks.ts");
const edgesSrc = read("src/data/chainEdges.ts");

// ---- 解析 SECTORS 白名单 ----
const secBlock = stocksSrc.match(/export const SECTORS\s*=\s*\[([\s\S]*?)\]\s*as const/);
const SECTORS = new Set(
  (secBlock ? secBlock[1].match(/"([^"]+)"/g) || [] : []).map((s) => s.replace(/"/g, ""))
);

// ---- 解析 STOCKS_BASE 每条 ----
const stocks = [];
const stockRe =
  /\{\s*code:\s*"([^"]+)"[^}]*?name:\s*"([^"]+)"[^}]*?sector:\s*"([^"]+)"[^}]*?relations:\s*\[([^\]]*)\]/g;
let m;
while ((m = stockRe.exec(stocksSrc))) {
  const relations = (m[4].match(/"([^"]+)"/g) || []).map((s) => s.replace(/"/g, ""));
  stocks.push({ code: m[1], name: m[2], sector: m[3], relations });
}

// ---- 解析 CHAIN_EDGES ----
const edges = [];
const edgeRe = /\{\s*from:\s*"([^"]+)",\s*to:\s*"([^"]+)"/g;
while ((m = edgeRe.exec(edgesSrc))) edges.push({ from: m[1], to: m[2] });

const byCode = new Set(stocks.map((s) => s.code));
const byName = new Set(stocks.map((s) => s.name));
const resolves = (tok) => byCode.has(tok) || byName.has(tok);

const errors = [];
const warns = [];

// ① 重复 code
const seen = new Set();
for (const s of stocks) {
  if (seen.has(s.code)) errors.push(`重复 code: ${s.code} (${s.name})`);
  seen.add(s.code);
}

// ② sector 白名单
for (const s of stocks) {
  if (!SECTORS.has(s.sector)) errors.push(`非法 sector「${s.sector}」: ${s.name}(${s.code})`);
}

// ③ relations 引用必须存在
for (const s of stocks) {
  for (const tok of s.relations) {
    if (!resolves(tok)) warns.push(`relations 引用未知标的「${tok}」: ${s.name}(${s.code})`);
  }
}

// ④ chainEdges 两端都在池内
for (const e of edges) {
  if (!byCode.has(e.from)) errors.push(`chainEdge from 不在池内: ${e.from} -> ${e.to}`);
  if (!byCode.has(e.to)) errors.push(`chainEdge to 不在池内: ${e.from} -> ${e.to}`);
}

// ⑤ 孤儿:无 relations、未出现在任何 chainEdge、也没被别的标的 relations 指到
const edgeCodes = new Set();
edges.forEach((e) => {
  edgeCodes.add(e.from);
  edgeCodes.add(e.to);
});
const referencedByOthers = new Set();
stocks.forEach((s) =>
  s.relations.forEach((tok) => {
    const c = byCode.has(tok) ? tok : [...stocks].find((x) => x.name === tok)?.code;
    if (c) referencedByOthers.add(c);
  })
);
const orphans = stocks.filter(
  (s) => s.relations.length === 0 && !edgeCodes.has(s.code) && !referencedByOthers.has(s.code)
);

// ---- 输出 ----
const wantList = process.argv.includes("--list");
console.log(`[data-check] 标的 ${stocks.length} · sector 白名单 ${SECTORS.size} · chainEdges ${edges.length}`);
console.log(`[data-check] 孤儿(详情页"暂无关联") ${orphans.length} 只 (${((orphans.length / stocks.length) * 100).toFixed(0)}%)`);
if (wantList && orphans.length) console.log("  孤儿:", orphans.map((s) => `${s.name}(${s.code})`).join("、"));
if (warns.length) {
  console.log(`\n⚠️  ${warns.length} 条警告:`);
  warns.slice(0, 40).forEach((w) => console.log("  - " + w));
}
if (errors.length) {
  console.log(`\n❌ ${errors.length} 条硬错误:`);
  errors.forEach((e) => console.log("  - " + e));
  process.exit(1);
}
console.log("\n✅ 数据自检通过(无硬错误)");
