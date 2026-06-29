#!/usr/bin/env node
// 用 Tushare 同花顺概念(ths_index/ths_member)给池内 A 股打"概念归属"多标签。
// 取每只票所属的同花顺概念板块(type N),用 AI 产业链主题白名单过滤掉行业/风格/财报噪声,
// 按"概念越小越具体"排序取 top 3,写 src/data/concepts.generated.ts。
// 用法:node scripts/enrich-concepts.mjs   (.env.local 读 TUSHARE_TOKEN;需 6000 积分)
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (p) => fs.readFileSync(path.join(ROOT, p), "utf8");
// token:CI 用 process.env;本地从 .env.local 读
function readToken() {
  if (process.env.TUSHARE_TOKEN) return process.env.TUSHARE_TOKEN.trim().replace(/^["']|["']$/g, "");
  try {
    const env = fs.readFileSync(path.join(ROOT, ".env.local"), "utf8");
    return (env.match(/TUSHARE_TOKEN=([^\s"']+)/) || [])[1];
  } catch {
    return null;
  }
}
const TOKEN = readToken();
if (!TOKEN) { console.error("缺 TUSHARE_TOKEN(env 或 .env.local)"); process.exit(1); }

const stocksSrc = read("src/data/stocks.ts");
const aCodes = [];
let m; const re = /code:\s*"([0-9]{6})"[^}]*?market:\s*"A股"/g;
while ((m = re.exec(stocksSrc))) aCodes.push(m[1]);

async function ts(api, params) {
  const r = await fetch("https://api.tushare.pro", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ api_name: api, token: TOKEN, params, fields: "" }),
  });
  const j = await r.json();
  if (j.code) throw new Error(`${api}: ${j.msg}`);
  const { fields, items } = j.data;
  return items.map((row) => Object.fromEntries(fields.map((f, i) => [f, row[i]])));
}

// 只保留 AI 产业链相关主题
const THEME = /铜缆|铜连接|高速连接|CPO|共封装|光模块|光通信|硅光|铌酸锂|液冷|温控|HBM|存储|先进封装|晶圆|光刻|刻蚀|半导体|特气|靶材|算力|人工智能|AI|GPU|CPU|芯片|服务器|PCB|覆铜板|载板|交换机|数据中心|东数西算|IDC|HVDC|电源|机器人|减速器|丝杠|人形|Optimus|电机|昇腾|华为|信创|国产|鸿蒙|欧拉|卫星|军工|稀土|钨|锗|MLCC|陶瓷基板|EDA|FPGA|模拟芯片|射频|CIS|智能驾驶|智能汽车|核电|核能|光芯片|大基金|中芯/;
// 剔除样本/风格/财报/资本运作类(即便命中白名单)
const BLOCK = /样本股|新质|中国AI\s*50|上证50|沪深300|中证\d|科创50|创业板指|深股通|沪股通|预增|预减|预亏|业绩|融资融券|转融|股权激励|高送转|破净|分红|MSCI|富时|标普|微盘|低价/;

function pickConcepts(boards) {
  return boards
    .filter((b) => THEME.test(b.name) && !BLOCK.test(b.name) && b.count >= 6 && b.count <= 800)
    .sort((a, b) => a.count - b.count)
    .slice(0, 3)
    .map((b) => b.name);
}

const tsCode = (c) => (c[0] === "6" ? `${c}.SH` : `${c}.SZ`);

const main = async () => {
  const idx = await ts("ths_index", { exchange: "A", type: "N" });
  const board = {};
  for (const b of idx) board[b.ts_code] = { name: b.name, count: Number(b.count) || 9999 };
  console.log(`概念板块(type N)${idx.length} 个;A股 ${aCodes.length} 只,开始拉成分…`);

  const out = {};
  const CONC = 5;
  const queue = [...aCodes];
  let done = 0;
  async function worker() {
    while (queue.length) {
      const c = queue.shift();
      try {
        const mem = await ts("ths_member", { con_code: tsCode(c) });
        const boards = mem.map((x) => board[x.ts_code]).filter(Boolean);
        const concepts = pickConcepts(boards);
        if (concepts.length) out[c] = concepts;
      } catch (e) { /* 跳过单只失败 */ }
      done++;
      if (done % 30 === 0) console.log(`  ...${done}/${aCodes.length}`);
    }
  }
  await Promise.all(Array.from({ length: CONC }, worker));

  console.log(`有概念标签的标的:${Object.keys(out).length}/${aCodes.length}`);
  const sorted = Object.keys(out).sort();
  const body = sorted.map((c) => `  "${c}": ${JSON.stringify(out[c])},`).join("\n");
  const file =
    `// 自动生成,勿手改。来源 Tushare 同花顺概念(ths_index/ths_member),AI产业链主题白名单过滤。\n` +
    `// 重新生成:node scripts/enrich-concepts.mjs\n` +
    `export const CONCEPTS: Record<string, string[]> = {\n${body}\n};\n`;
  fs.writeFileSync(path.join(ROOT, "src/data/concepts.generated.ts"), file);
  console.log("已写 src/data/concepts.generated.ts");
};

main().catch((e) => { console.error(String(e)); process.exit(1); });
