#!/usr/bin/env node
// 产业链护城河·覆盖体检:用同花顺概念成分(ths_index/ths_member)反查——
//  1) 池外候选:不在 STOCK_MAP、却落在多个 AI 概念板块里的票(命中越多越该收);
//  2) 概念覆盖率:每个 AI 概念我们收了几只 / 共几只(哪条链收得薄)。
// 产出 docs/concept-coverage.generated.md 供人工审阅后决定是否补进 src/data/stocks.ts(不自动入池,保住人工策展的护城河)。
// 用法:node scripts/concept-coverage.mjs   (.env.local 读 TUSHARE_TOKEN;需 6000 积分)
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (p) => fs.readFileSync(path.join(ROOT, p), "utf8");
function readToken() {
  if (process.env.TUSHARE_TOKEN) return process.env.TUSHARE_TOKEN.trim().replace(/^["']|["']$/g, "");
  try {
    return (read(".env.local").match(/TUSHARE_TOKEN=([^\s"']+)/) || [])[1];
  } catch {
    return null;
  }
}
const TOKEN = readToken();
if (!TOKEN) {
  console.error("缺 TUSHARE_TOKEN(env 或 .env.local)");
  process.exit(1);
}

// 现有 A 股池
const stocksSrc = read("src/data/stocks.ts");
const universe = new Set();
let m;
const re = /code:\s*"([0-9]{6})"[^}]*?market:\s*"A股"/g;
while ((m = re.exec(stocksSrc))) universe.add(m[1]);

async function ts(api, params) {
  const r = await fetch("https://api.tushare.pro", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ api_name: api, token: TOKEN, params, fields: "" }),
  });
  const j = await r.json();
  if (j.code) throw new Error(`${api}: ${j.msg}`);
  return j.data.items.map((row) => Object.fromEntries(j.data.fields.map((f, i) => [f, row[i]])));
}

// 与 enrich-concepts 同一套 AI 主题口径
const THEME = /铜缆|铜连接|高速连接|CPO|共封装|光模块|光通信|硅光|铌酸锂|液冷|温控|HBM|存储|先进封装|晶圆|光刻|刻蚀|半导体|特气|靶材|算力|人工智能|AI|GPU|CPU|芯片|服务器|PCB|覆铜板|载板|交换机|数据中心|东数西算|IDC|HVDC|电源|机器人|减速器|丝杠|人形|Optimus|电机|昇腾|华为|信创|国产|鸿蒙|欧拉|卫星|军工|稀土|钨|锗|MLCC|陶瓷基板|EDA|FPGA|模拟芯片|射频|CIS|智能驾驶|智能汽车|核电|核能|光芯片|大基金|中芯/;
const BLOCK = /样本股|新质|中国AI\s*50|上证50|沪深300|中证\d|科创50|创业板指|深股通|沪股通|预增|预减|预亏|业绩|融资融券|转融|股权激励|高送转|破净|分红|MSCI|富时|标普|微盘|低价/;

const bare = (c) => String(c).split(".")[0];
const isAshare = (c) => /^(0|3|6)\d{5}$/.test(bare(c)); // 沪深 A 股(剔除北交所/基金)

const main = async () => {
  const idx = await ts("ths_index", { exchange: "A", type: "N" });
  const aiBoards = idx
    .map((b) => ({ ts_code: b.ts_code, name: b.name, count: Number(b.count) || 9999 }))
    .filter((b) => THEME.test(b.name) && !BLOCK.test(b.name) && b.count >= 6 && b.count <= 800);
  console.log(`AI 相关概念板块 ${aiBoards.length} 个,拉成分中…`);

  const cand = new Map(); // 池外候选 code -> {name, concepts:Set}
  const coverage = []; // 每个概念覆盖率

  for (const b of aiBoards) {
    let mem = [];
    try {
      mem = await ts("ths_member", { ts_code: b.ts_code });
    } catch {
      continue;
    }
    const aMem = mem.filter((x) => isAshare(x.con_code));
    const inUni = aMem.filter((x) => universe.has(bare(x.con_code))).length;
    coverage.push({ name: b.name, total: aMem.length, covered: inUni });
    for (const x of aMem) {
      const code = bare(x.con_code);
      if (universe.has(code)) continue;
      const c = cand.get(code) || { name: x.con_name, concepts: new Set() };
      c.concepts.add(b.name);
      cand.set(code, c);
    }
  }

  const candidates = Array.from(cand.entries())
    .map(([code, v]) => ({ code, name: v.name, hits: v.concepts.size, concepts: Array.from(v.concepts) }))
    .filter((c) => c.hits >= 2) // 至少落在 2 个 AI 概念里才算候选(降噪)
    .sort((a, b) => b.hits - a.hits)
    .slice(0, 150);

  coverage.sort((a, b) => a.covered / a.total - b.covered / b.total);

  const md = [
    `# 产业链覆盖体检(自动生成,勿手改)`,
    ``,
    `> 来源:Tushare 同花顺概念成分。审阅后**人工**决定是否把候选补进 \`src/data/stocks.ts\`(不自动入池)。`,
    `> 现有 A 股池:${universe.size} 只;扫描 AI 概念板块:${aiBoards.length} 个。`,
    ``,
    `## 一、池外候选(命中 ≥2 个 AI 概念,按命中数排序,Top ${candidates.length})`,
    ``,
    `| 代码 | 名称 | 命中AI概念数 | 概念 |`,
    `|---|---|---|---|`,
    ...candidates.map((c) => `| ${c.code} | ${c.name} | ${c.hits} | ${c.concepts.slice(0, 5).join("、")} |`),
    ``,
    `## 二、概念覆盖率(覆盖最薄的在前)`,
    ``,
    `| 概念 | 已收/总数 | 覆盖率 |`,
    `|---|---|---|`,
    ...coverage.map(
      (c) => `| ${c.name} | ${c.covered}/${c.total} | ${((c.covered / c.total) * 100).toFixed(0)}% |`
    ),
    ``,
  ].join("\n");

  fs.writeFileSync(path.join(ROOT, "docs/concept-coverage.generated.md"), md);
  console.log(`\n池外候选(命中≥2):${candidates.length} 只。Top 15:`);
  for (const c of candidates.slice(0, 15)) console.log(`  ${c.code} ${c.name}  命中 ${c.hits}:${c.concepts.slice(0, 4).join("、")}`);
  console.log(`\n报告已写 docs/concept-coverage.generated.md`);
};

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
