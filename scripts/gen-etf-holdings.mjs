#!/usr/bin/env node
// ETF↔个股 反查层:拉科技/AI 主题 ETF 的季报持仓(fund_portfolio),建"个股 → 重仓它的 ETF"反向索引。
// 让散户在个股页看到"想一篮子参与这只票/赛道,可以买哪些 ETF"。生成 src/data/etf-holdings.generated.ts(运行时零外部调用)。
// 用法:node scripts/gen-etf-holdings.mjs   (.env.local 读 TUSHARE_TOKEN;需基金持仓权限)
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
  console.error("缺 TUSHARE_TOKEN");
  process.exit(1);
}

// 现有 A 股池(只为池内票建索引)
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

// 只取科技/AI 主题 ETF,排除宽基/无关行业(否则沪深300等会把每只票都"相关"上)
const THEME = /通信|算力|云计算|数据中心|人工智能|科技龙头|电子|信息技术|半导体|芯片|集成电路|数字经济|机器人|软件|计算机|消费电子|5G|物联网|大数据|信创|光通信|光模块/;
const BLOCK = /光伏|医药|生物|消费(?!电子)|白酒|食品|饮料|军工|国防|新能源|有色|证券|银行|地产|房地产|红利|价值|成长|动量|低波|沪深300|中证500|上证50|科创50|创业板指数?|中证1000|中证100|MSCI|ESG|碳中和|汽车|煤炭|钢铁|化工|农业|养殖|旅游|传媒|游戏|REIT|债|黄金|商品/;
const bare = (c) => String(c).split(".")[0];
const MIN_RATIO = 1.0; // 占比 ≥1% 才算"相关",滤掉边角持仓
const MAX_RATIO = 30; // 占比 >30% 多为迷你基金/数据噪声(正常 ETF 单票封顶约 10-15%),剔除
const TOP_PER_STOCK = 5;

const main = async () => {
  const funds = await ts("fund_basic", { market: "E" });
  const targets = funds
    .filter((f) => f.name && THEME.test(f.name) && !BLOCK.test(f.name))
    .map((f) => ({ code: f.ts_code, name: f.name }));
  console.log(`主题 ETF ${targets.length} 只,拉季报持仓中…`);

  // stockCode -> [{code,name,ratio}]
  const rev = new Map();
  let done = 0;
  for (const etf of targets) {
    let port = [];
    try {
      port = await ts("fund_portfolio", { ts_code: etf.code });
    } catch {
      continue;
    }
    if (!port.length) continue;
    const latest = port.reduce((a, b) => (String(b.end_date) > String(a) ? String(b.end_date) : a), "0");
    for (const h of port) {
      if (String(h.end_date) !== latest) continue;
      const code = bare(h.symbol);
      const ratio = Number(h.stk_mkv_ratio) || 0;
      if (!universe.has(code) || ratio < MIN_RATIO || ratio > MAX_RATIO) continue;
      const arr = rev.get(code) || [];
      arr.push({ code: bare(etf.code), name: shortName(etf.name), ratio: Math.round(ratio * 10) / 10 });
      rev.set(code, arr);
    }
    if (++done % 30 === 0) console.log(`  …${done}/${targets.length}`);
  }

  const out = {};
  for (const [code, arr] of rev) {
    // 同指数不同基金公司(同名)只留占比最高的一只,避免列出 6 个"创业板人工智能ETF"
    const byName = new Map();
    for (const e of arr.sort((a, b) => b.ratio - a.ratio)) {
      if (!byName.has(e.name)) byName.set(e.name, e);
    }
    out[code] = Array.from(byName.values()).slice(0, TOP_PER_STOCK);
  }

  const file =
    `// 自动生成,勿手改。来源 Tushare 基金季报持仓(fund_portfolio),主题 ETF 反查。\n` +
    `// 个股 code → 重仓它的 ETF [{code,name,占比%}](占比≥${MIN_RATIO}%,按占比取前 ${TOP_PER_STOCK})。\n` +
    `export const ETF_HOLDINGS: Record<string, { code: string; name: string; ratio: number }[]> = ${JSON.stringify(
      out,
      null,
      0
    )};\n`;
  fs.writeFileSync(path.join(ROOT, "src/data/etf-holdings.generated.ts"), file);
  console.log(`\n有相关 ETF 的池内票:${Object.keys(out).length}/${universe.size}`);
  console.log("写 src/data/etf-holdings.generated.ts");
};

// ETF 名缩短:去基金公司前缀冗余,保留辨识度
function shortName(n) {
  return n
    .replace(/^(华夏|易方达|华泰柏瑞|国泰|嘉实|南方|博时|广发|富国|招商|华宝|华安|银华|鹏华|工银瑞信|汇添富|天弘|平安|融通|建信|中金|华富|万家|景顺长城|国联安|中银证券|永赢|大成|中欧|诺安|金鹰)/, "")
    .replace(/(中证|国证|上证|深证)?(全指)?/g, "")
    .trim();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
