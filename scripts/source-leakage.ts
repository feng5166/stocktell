// 旧源直读检查(P1-4·P1-1 收敛用)。链页/首页/简报/admin 不应把旧 relation.ts(仅 INSIGHT_CHAINS 派生、
// 不含审计核定源)当关系【主源】直读——那会和 /stocks 等读 relationResolver 的面产生同票跨页两标签。
// relationResolver 是唯一读入口;旧源只能作 fallback。默认 warning(exit 0);--blocking 时非零退出。
// 用法:npx tsx scripts/source-leakage.ts [--blocking]。扫描规则单一源:scripts/leakage-rules.ts(与 replay 共用)。
import { scanSourceLeakage } from "./leakage-rules";

const hits = scanSourceLeakage().map((h) => `${h.file}:${h.line}  ${h.text}`);

const blocking = process.argv.includes("--blocking");
if (hits.length) {
  console.log(`⚠️ 旧 relation.ts 主路径直读 ${hits.length} 处(应走 relationResolver):`);
  hits.forEach((h) => console.log("  " + h));
  console.log(blocking ? "\n✗ --blocking:视为失败" : "\n(warning 模式:先观察,收敛完再切 blocking)");
  process.exit(blocking ? 1 : 0);
}
console.log("✅ 无旧 relation.ts 主路径直读");
process.exit(0);
