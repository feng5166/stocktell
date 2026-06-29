#!/usr/bin/env node
// 用 Tushare daily_basic 给池内 A 股拉 流通市值/换手/PE,派生「市值档 + 热度」标签,
// 写入 src/data/enrichment.generated.ts(静态文件,随仓库走,运行时零外部调用)。
// 用法:node scripts/enrich-tushare.mjs   (从 .env.local 读 TUSHARE_TOKEN)
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (p) => fs.readFileSync(path.join(ROOT, p), "utf8");

// 读取 token
const env = read(".env.local");
const TOKEN = (env.match(/TUSHARE_TOKEN=([^\s"']+)/) || [])[1];
if (!TOKEN) {
  console.error("没找到 TUSHARE_TOKEN");
  process.exit(1);
}

// 池内 A 股代码
const stocksSrc = read("src/data/stocks.ts");
const aCodes = new Set();
const re = /code:\s*"([0-9]{6})"[^}]*?market:\s*"A股"/g;
let m;
while ((m = re.exec(stocksSrc))) aCodes.add(m[1]);
console.log("A股标的:", aCodes.size);

const toTsCode = (c) => (c[0] === "6" ? `${c}.SH` : `${c}.SZ`);

async function tushare(api_name, params, fields) {
  const r = await fetch("https://api.tushare.pro", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ api_name, token: TOKEN, params, fields }),
  });
  const j = await r.json();
  if (j.code !== 0) throw new Error(`tushare ${api_name}: ${j.msg}`);
  const { fields: fs2, items } = j.data;
  return items.map((row) => Object.fromEntries(fs2.map((f, i) => [f, row[i]])));
}

function ymd(d) {
  return `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}${String(d.getDate()).padStart(2, "0")}`;
}

const main = async () => {
  // 找最近有数据的交易日(往回试 10 天)
  let rows = [];
  let usedDate = "";
  for (let i = 0; i < 10; i++) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const date = ymd(d);
    rows = await tushare("daily_basic", { trade_date: date }, "ts_code,circ_mv,turnover_rate,pe");
    if (rows.length > 0) {
      usedDate = date;
      break;
    }
  }
  if (!rows.length) throw new Error("daily_basic 连续 10 天无数据");
  console.log(`daily_basic @ ${usedDate}: 全市场 ${rows.length} 条`);

  const capTier = (yi) => (yi >= 1000 ? "大盘" : yi >= 100 ? "中盘" : "小盘");
  const heat = (t) => (t == null ? null : t >= 20 ? "极热" : t >= 10 ? "活跃" : t >= 4 ? "正常" : "清淡");

  const enrich = {};
  let hit = 0;
  for (const row of rows) {
    const code = String(row.ts_code).slice(0, 6);
    if (!aCodes.has(code)) continue;
    const circYi = row.circ_mv != null ? Math.round((row.circ_mv / 10000) * 10) / 10 : null; // 万元→亿
    const turnover = row.turnover_rate != null ? Math.round(row.turnover_rate * 100) / 100 : null;
    const pe = row.pe != null ? Math.round(row.pe * 10) / 10 : null;
    enrich[code] = {
      circMvYi: circYi,
      turnover,
      pe,
      capTier: circYi != null ? capTier(circYi) : null,
      heat: heat(turnover),
    };
    hit++;
  }
  console.log(`命中池内 A股: ${hit}/${aCodes.size}`);
  const missing = [...aCodes].filter((c) => !enrich[c]);
  if (missing.length) console.log("未取到(停牌/退市/代码异常):", missing.join("、"));

  const out =
    `// 自动生成,勿手改。来源 Tushare daily_basic @ ${usedDate}。\n` +
    `// 重新生成:node scripts/enrich-tushare.mjs\n` +
    `export interface Enrich { circMvYi: number | null; turnover: number | null; pe: number | null; capTier: string | null; heat: string | null; }\n` +
    `export const ENRICH_AS_OF = "${usedDate}";\n` +
    `export const ENRICH: Record<string, Enrich> = ${JSON.stringify(enrich, null, 2)};\n`;
  fs.writeFileSync(path.join(ROOT, "src/data/enrichment.generated.ts"), out);
  console.log("已写 src/data/enrichment.generated.ts");
};

main().catch((e) => {
  console.error(String(e));
  process.exit(1);
});
