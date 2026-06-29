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
  // 拉最近 5 个有数据的交易日(往回试 ~16 天),换手取 5 日均值更稳、抗单日噪声;
  // 市值/PE 用最新交易日。
  const days = []; // [{date, rows}]
  let latestDate = "";
  for (let i = 0; i < 16 && days.length < 5; i++) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const date = ymd(d);
    const rows = await tushare("daily_basic", { trade_date: date }, "ts_code,circ_mv,turnover_rate,pe");
    if (rows.length > 0) {
      if (!latestDate) latestDate = date;
      days.push({ date, rows });
    }
  }
  if (!days.length) throw new Error("daily_basic 连续 16 天无数据");
  console.log(`daily_basic 取 ${days.length} 个交易日(最新 ${latestDate}),全市场约 ${days[0].rows.length} 条/日`);

  const capTier = (yi) => (yi >= 1000 ? "大盘" : yi >= 100 ? "中盘" : "小盘");
  const heat = (t) => (t == null ? null : t >= 15 ? "极热" : t >= 8 ? "活跃" : t >= 3 ? "正常" : "清淡");

  // 最新日:市值/PE;5 日:换手均值
  const latest = new Map(days[0].rows.map((r) => [String(r.ts_code).slice(0, 6), r]));
  const turnSum = new Map(); // code -> {sum,n}
  for (const { rows } of days) {
    for (const r of rows) {
      const code = String(r.ts_code).slice(0, 6);
      if (!aCodes.has(code) || r.turnover_rate == null) continue;
      const cur = turnSum.get(code) || { sum: 0, n: 0 };
      cur.sum += r.turnover_rate;
      cur.n += 1;
      turnSum.set(code, cur);
    }
  }

  const enrich = {};
  let hit = 0;
  for (const code of aCodes) {
    const row = latest.get(code);
    if (!row) continue;
    const circYi = row.circ_mv != null ? Math.round((row.circ_mv / 10000) * 10) / 10 : null; // 万元→亿
    const ts = turnSum.get(code);
    const turnover = ts && ts.n ? Math.round((ts.sum / ts.n) * 100) / 100 : null; // 近5日均换手
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
  const usedDate = latestDate;
  console.log(`命中池内 A股: ${hit}/${aCodes.size}`);
  const missing = [...aCodes].filter((c) => !enrich[c]);
  if (missing.length) console.log("未取到(停牌/退市/代码异常):", missing.join("、"));

  const out =
    `// 自动生成,勿手改。来源 Tushare daily_basic @ ${usedDate}(换手=近5日均值)。\n` +
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
