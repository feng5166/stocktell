#!/usr/bin/env node
// 给池内每只(未手写人话结论的)标的,用 LLM 生成一句"散户怎么想"的人话结论。
// 并发池 8;输出 src/data/retail-takes.generated.ts(makeRetailTake 优先级:手写 > 生成 > 模板)。
// 用法:node scripts/gen-retail-takes.mjs   (从 .env.local 读 LLM_API_KEY/LLM_BASE_URL)
//   可选:GEN_MODEL=deepseek-v4-flash(默认)  CONCURRENCY=8  LIMIT=0(0=全量)
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (p) => fs.readFileSync(path.join(ROOT, p), "utf8");
const env = read(".env.local");
const get = (k, d) =>
  ((env.match(new RegExp(`^${k}=([^\\n\\r]+)`, "m")) || [])[1] || "")
    .trim()
    .replace(/^["']|["']$/g, "") || d;
const API_KEY = get("LLM_API_KEY");
const BASE = (get("LLM_BASE_URL", "https://api.modelverse.cn/v1")).replace(/\/$/, "");
const MODEL = process.env.GEN_MODEL || "deepseek-v4-flash";
const CONC = Number(process.env.CONCURRENCY || 8);
const LIMIT = Number(process.env.LIMIT || 0);
if (!API_KEY) { console.error("缺 LLM_API_KEY"); process.exit(1); }

const stocksSrc = read("src/data/stocks.ts");

// 手写人话结论的 code(跳过)
const handBlock = stocksSrc.match(/const RETAIL_TAKES[\s\S]*?\n\};/);
const hand = new Set([...(handBlock ? handBlock[0].matchAll(/"?([0-9A-Za-z]+)"?\s*:/g) : [])].map((m) => m[1]).filter((c) => /^[0-9]{6}$|^[A-Z]+$/.test(c)));

// 解析标的
const stocks = [];
const re = /\{\s*code:\s*"([^"]+)",\s*name:\s*"([^"]+)",\s*market:\s*"([^"]+)",\s*position:\s*"([^"]+)",\s*sector:\s*"([^"]+)",\s*positioning:\s*"([^"]+)",\s*observation:\s*"([^"]+)"/g;
let m;
while ((m = re.exec(stocksSrc))) {
  stocks.push({ code: m[1], name: m[2], market: m[3], position: m[4], sector: m[5], positioning: m[6], observation: m[7] });
}
// TIER / 板块释义(给提示词更多上下文)
const tier = {};
const tBlock = stocksSrc.match(/export const TIER[\s\S]*?\n\};/);
if (tBlock) for (const mm of tBlock[0].matchAll(/"([0-9]{6})":\s*"(龙头|二线)"/g)) tier[mm[1]] = mm[2];
const gloss = {};
const gBlock = stocksSrc.match(/export const SECTOR_GLOSS[\s\S]*?\n\};/);
if (gBlock) for (const mm of gBlock[0].matchAll(/"?([^"\n:]+)"?:\s*"([^"]+)"/g)) gloss[mm[1].trim()] = mm[2];
let enrich = {};
try { const e = read("src/data/enrichment.generated.ts"); const j = e.match(/ENRICH[^=]*=\s*(\{[\s\S]*\});/); if (j) enrich = JSON.parse(j[1]); } catch {}

let todo = stocks.filter((s) => !hand.has(s.code));
if (LIMIT) todo = todo.slice(0, LIMIT);
console.log(`总 ${stocks.length} · 手写跳过 ${stocks.length - todo.length} · 待生成 ${todo.length} · 模型 ${MODEL} · 并发 ${CONC}`);

const SYS = `你是 StockTell 的"盯盘搭子",面向看不懂产业链的 A 股散户。给你一只票的资料,用一两句大白话点出:它在 AI 产业链里干哪一环、当下是什么角色(龙头/二线弹性/题材股)、能不能安心拿(给风险提示)。
要求:像懂行的朋友顺手提醒,口语、说人话;绝不喊买卖、不给操作建议(不出现买入/卖出/加仓/抄底);语气平稳不制造焦虑,不用"暴跌/崩盘/血洗"等吓人词;≤55 字,1-2 句;只输出结论本身,不要任何前缀、引号或解释。`;

async function gen(s) {
  const ctx = [
    `名称:${s.name}(${s.market})`,
    `板块:${s.sector}${gloss[s.sector] ? `(${gloss[s.sector]})` : ""}`,
    `产业链位置:${s.position}`,
    tier[s.code] ? `梯队:${tier[s.code]}` : "",
    enrich[s.code]?.capTier ? `市值档:${enrich[s.code].capTier}` : "",
    enrich[s.code]?.heat ? `近期热度:${enrich[s.code].heat}` : "",
    `定位:${s.positioning}`,
    `关键观察:${s.observation}`,
  ].filter(Boolean).join("\n");
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const r = await fetch(`${BASE}/chat/completions`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${API_KEY}` },
        body: JSON.stringify({
          model: MODEL,
          messages: [{ role: "system", content: SYS }, { role: "user", content: ctx }],
          max_tokens: 200,
          temperature: 0.6,
        }),
      });
      const j = await r.json();
      const txt = (j.choices?.[0]?.message?.content || "").trim().replace(/^["「]|["」]$/g, "");
      if (txt) return txt;
    } catch (e) { /* retry */ }
  }
  return null;
}

const out = {};
let done = 0;
async function worker(queue) {
  while (queue.length) {
    const s = queue.shift();
    const t = await gen(s);
    if (t) out[s.code] = t;
    done++;
    if (done % 20 === 0) console.log(`  ...${done}/${todo.length}`);
  }
}
const queue = [...todo];
await Promise.all(Array.from({ length: CONC }, () => worker(queue)));

console.log(`生成成功 ${Object.keys(out).length}/${todo.length}`);
const sorted = Object.keys(out).sort();
const body = sorted.map((c) => `  "${c}": ${JSON.stringify(out[c])},`).join("\n");
const file =
  `// 自动生成,勿手改。LLM(${MODEL})逐只生成的"散户怎么想"人话结论。\n` +
  `// 重新生成:node scripts/gen-retail-takes.mjs。手写 RETAIL_TAKES 优先级高于此。\n` +
  `export const GEN_RETAIL_TAKES: Record<string, string> = {\n${body}\n};\n`;
fs.writeFileSync(path.join(ROOT, "src/data/retail-takes.generated.ts"), file);
console.log("已写 src/data/retail-takes.generated.ts");
