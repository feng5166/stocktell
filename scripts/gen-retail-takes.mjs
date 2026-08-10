#!/usr/bin/env node
// 给池内每只(未手写人话结论的)标的,用 LLM 生成一句「定位+观察点」的人话结论。
// 并发池 8;输出 src/data/retail-takes.generated.ts(makeRetailTake 优先级:手写 > 生成 > 模板)。
// 产出逐条过 content-guard(与运行时同一禁词源):违规重试,重试仍违规则弃用该条回落模板——
// 此前脚本绕过护栏,「重仓/接盘侠」这类词直接落库进 /stocks(2026-08 静态扫描补漏)。
// 用法:npx tsx scripts/gen-retail-takes.mjs   (从 .env.local 读 LLM_API_KEY/LLM_BASE_URL;
//   tsx 而非 node:要 import TS 的 content-guard,保持禁词单一来源)
//   可选:GEN_MODEL=deepseek-v4-flash(默认)  CONCURRENCY=8  LIMIT=0(0=全量)
//   增量:ONLY=601127,301236 只为指定 code 生成,并与既有 generated 文件【合并】写回——
//   新股入池后补文案用它,别全量重生成翻搅已有 129 条文案(2026-07-30 华为链一批)。
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { isComplianceClean } from "../src/lib/content-guard";

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

const ONLY = (process.env.ONLY || "").split(",").map((c) => c.trim()).filter(Boolean);
let todo = stocks.filter((s) => !hand.has(s.code));
if (ONLY.length) todo = todo.filter((s) => ONLY.includes(s.code));
if (LIMIT) todo = todo.slice(0, LIMIT);
console.log(`总 ${stocks.length} · 手写跳过 ${stocks.length - todo.length} · 待生成 ${todo.length}${ONLY.length ? `(ONLY 增量模式,与既有文件合并)` : ""} · 模型 ${MODEL} · 并发 ${CONC}`);

const SYS = `你是 StockTell 的"产业链搭子",面向看不懂产业链的 A 股散户。给你一只票的资料,用一两句大白话点出:它在 AI 产业链里干哪一环、当下是什么角色(龙头/二线弹性/题材股)、能不能安心拿(给风险提示)。
要求:像懂行的朋友顺手提醒,口语、说人话;绝不喊买卖、不给操作建议(不出现买入/卖出/加仓/抄底);也不要"别急着追/别重仓/追高需谨慎/逢回调关注"这类软性操作暗示,改用"观察/验证/情绪映射还是订单兑现"口径;不用仓位与盘面词(重仓/底仓/压舱石/接盘/错杀/企稳);语气平稳不制造焦虑,不用"暴跌/崩盘/血洗"等吓人词;≤55 字,1-2 句;只输出结论本身,不要任何前缀、引号或解释。`;

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
  for (let attempt = 0; attempt < 3; attempt++) {
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
      if (txt) {
        // 生成后合规校验(与运行时同源):违规就重试,3 次仍违规弃用该条(回落模板)
        const v = isComplianceClean(txt);
        if (v.ok) return txt;
        console.warn(`  ✗ ${s.code} 第${attempt + 1}次生成违规[${v.bannedHits.join("、")}${v.hasNumber ? "、具体涨跌数字" : ""}]:${txt}`);
      }
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
// ONLY 增量模式:读回既有 generated 文件合并(新生成覆盖同 code),不丢其余票的文案
if (ONLY.length) {
  try {
    const prev = read("src/data/retail-takes.generated.ts");
    const j = prev.match(/GEN_RETAIL_TAKES[^=]*=\s*(\{[\s\S]*\});/);
    if (j) {
      // 生成文件是 TS 字面量(末行带尾逗号),JSON.parse 前先剥掉
      const old = JSON.parse(j[1].replace(/,(\s*\})/g, "$1"));
      for (const [c, t] of Object.entries(old)) if (!(c in out)) out[c] = t;
    }
  } catch { /* 首次生成无旧文件 */ }
}
const sorted = Object.keys(out).sort();
const body = sorted.map((c) => `  "${c}": ${JSON.stringify(out[c])},`).join("\n");
const file =
  `// 自动生成,勿手改。LLM(${MODEL})逐只生成的"人话结论"(定位+观察点)。\n` +
  `// 重新生成:node scripts/gen-retail-takes.mjs。手写 RETAIL_TAKES 优先级高于此。\n` +
  `export const GEN_RETAIL_TAKES: Record<string, string> = {\n${body}\n};\n`;
fs.writeFileSync(path.join(ROOT, "src/data/retail-takes.generated.ts"), file);
console.log("已写 src/data/retail-takes.generated.ts");
