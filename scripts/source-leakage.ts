// 旧源直读检查(P1-4·P1-1 收敛用)。链页/首页/简报/admin 不应把旧 relation.ts(仅 INSIGHT_CHAINS 派生、
// 不含审计核定源)当关系【主源】直读——那会和 /stocks 等读 relationResolver 的面产生同票跨页两标签。
// relationResolver 是唯一读入口;旧源只能作 fallback。默认 warning(exit 0);--blocking 时非零退出。
// 用法:npx tsx scripts/source-leakage.ts [--blocking]
import { readdirSync, readFileSync, statSync } from "fs";
import { join } from "path";

const OLD = /relationForCodeInChain|relationLabelFor|insightBundleForCode|segmentForCodeInChain|from ["']@\/lib\/relation["']/;
// 跳过:旧源定义本身 + 新体系(resolver/rank/lint/watch/chain-relations/diagnostics)+ 脚本自身
const SKIP = /relation-resolver|relation-rank|relation-lint|watch-relation|chain-relations|resolver-diagnostics|source-leakage|[/\\]relation\.ts$/;

const hits: string[] = [];
function walk(dir: string) {
  for (const f of readdirSync(dir)) {
    const p = join(dir, f);
    const st = statSync(p);
    if (st.isDirectory()) walk(p);
    else if (/\.(ts|tsx)$/.test(p) && !SKIP.test(p)) {
      readFileSync(p, "utf8")
        .split("\n")
        .forEach((line, i) => {
          const t = line.trim();
          if (OLD.test(line) && !t.startsWith("//") && !t.startsWith("*")) hits.push(`${p}:${i + 1}  ${t.slice(0, 90)}`);
        });
    }
  }
}
walk("src");

const blocking = process.argv.includes("--blocking");
if (hits.length) {
  console.log(`⚠️ 旧 relation.ts 主路径直读 ${hits.length} 处(应走 relationResolver;generate.ts/admin 待周二真实管线后切):`);
  hits.forEach((h) => console.log("  " + h));
  console.log(blocking ? "\n✗ --blocking:视为失败" : "\n(warning 模式:先观察,收敛完再切 blocking)");
  process.exit(blocking ? 1 : 0);
}
console.log("✅ 无旧 relation.ts 主路径直读");
process.exit(0);
