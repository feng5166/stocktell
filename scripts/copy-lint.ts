// 静态文案禁词扫描(对外口径收口的机器护栏)。
// 背景:content-guard 只拦【LLM 运行时输出】;静态 UI 文案与 src/data/* 数据文件
// (stocks.ts observation、retail-takes.generated.ts)一直绕过护栏——2.0 收口后的
// 「企稳/错杀/重仓」残留全部来自这条盲区(2026-08 外部评审复核)。本脚本补上:
// 扫 src/ 下所有 .ts/.tsx 的非注释行,复用 content-guard 的 BANNED+白名单单一来源,
// 另加 UI 级旧口径词(散户怎么想/盯盘搭子)。有违规非零退出。
//
// 判定规则(按序):
// 1. 注释行(// | /* | * | {/*)跳过——注释里的禁词不面向用户,由 code review 管;
// 2. content-guard.ts 自身跳过(它就是禁词单一来源);
// 3. 同行含 `copylint-allow` 显式豁免(注明理由,留痕可审计)——适用于护栏正则等
//    无法用否定语境判定的合法行;模板字符串内部无法加注释,只能改写文案;
// 4. 否定/禁止语境放行:合规声明(「不提供买入、卖出…」)与 prompt 负面指令
//    (「禁止 买入/卖出…」)必然带否定标记词,静态白样本全量核过;运行时仍有
//    content-guard 兜底,此处放行不构成合规缺口;
// 5. 「放量/缩量/出货」歧义词:产业语义(订单放量、终端出货)在数据文案中大量
//    正当使用(7 月文案复审 79c0597 保留的口径),只在【盘面搭配】时才算违规
//    (放量下杀/缩量企稳/主力出货…)。LLM 运行时输出不享受此宽免(content-guard 裸禁)。
// 用法:npx tsx scripts/copy-lint.ts(已聚合进 npm run check:relations)
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { scanBannedWords } from "../src/lib/content-guard";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SCAN_DIRS = ["src/data", "src/app", "src/components", "src/lib"];
const SKIP_FILES = new Set(["src/lib/content-guard.ts"]);
// content-guard 之外的 UI 级旧口径词(1.0 心智,2.0 起全产品下线)
const EXTRA_BANNED = /散户怎么想|盯盘搭子/g;
// 否定/禁止语境标记(规则 4)
const NEGATION_CONTEXT =
  /禁止|禁盘口词|一律不|不出现|不提供|不构成|不推荐|不代表|不含|不预示|不用任何|不喊|不做|不是|绝不|勿/;
// 歧义词的盘面搭配(规则 5):命中这些才把 放量/缩量/出货 记为违规
const AMBIGUOUS = new Set(["放量", "缩量", "出货"]);
const PANMIAN_COLLOCATION =
  /放量(下杀|上攻|滞涨|出货|对倒|大阳|大阴|突破|跳水)|缩量(企稳|阴跌|盘整|回调|反弹|跳水)|(高位|主力|尾盘|盘中|借利好)[^,,。;;、]{0,4}(出货|派发)|出货(迹象|痕迹)/;

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...walk(p));
    else if (/\.(ts|tsx)$/.test(e.name)) out.push(p);
  }
  return out;
}

type Hit = { file: string; line: number; words: string[]; excerpt: string };
const hits: Hit[] = [];

for (const dir of SCAN_DIRS) {
  for (const file of walk(path.join(ROOT, dir))) {
    const rel = path.relative(ROOT, file);
    if (SKIP_FILES.has(rel)) continue;
    const lines = fs.readFileSync(file, "utf8").split("\n");
    let inBlockComment = false;
    lines.forEach((raw, i) => {
      const t = raw.trim();
      if (inBlockComment) {
        if (t.includes("*/")) inBlockComment = false;
        return;
      }
      if (t.startsWith("//") || t.startsWith("*") || t.startsWith("/*") || t.startsWith("{/*")) {
        if (t.startsWith("/*") && !t.includes("*/")) inBlockComment = true;
        return;
      }
      if (raw.includes("copylint-allow")) return; // 规则 3:显式豁免
      // 行尾注释剥掉再扫,避免「// 旧称联动有效率」这类迁移注记误报;
      // 粗剥(不解析字符串里的 //):URL 场景 https:// 后不含中文禁词,可接受
      const code = raw.replace(/\/\/.*$/, "");
      if (NEGATION_CONTEXT.test(code)) return; // 规则 4:否定语境放行
      let words = scanBannedWords(code).concat(Array.from(new Set(code.match(EXTRA_BANNED) ?? [])));
      // 规则 5:歧义词仅盘面搭配算违规
      if (!PANMIAN_COLLOCATION.test(code)) words = words.filter((w) => !AMBIGUOUS.has(w));
      if (words.length) hits.push({ file: rel, line: i + 1, words, excerpt: t.slice(0, 80) });
    });
  }
}

if (!hits.length) {
  console.log("✅ 静态文案禁词扫描全过(src/data · src/app · src/components · src/lib)");
  process.exit(0);
}
console.log(`✗ ${hits.length} 处静态文案禁词:`);
for (const h of hits) console.log(`  ${h.file}:${h.line} [${h.words.join("、")}] ${h.excerpt}`);
console.log("\n处理:改成产业口径(参考 content-guard INDUSTRIAL_WHITELIST);确属合法语境在该行加 copylint-allow 注释并注明理由(模板字符串内部加不了注释,改写文案本身)。");
process.exit(1);
