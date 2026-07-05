// 新增关系准入 lint CLI(观察期 #4)。回灌前 / CI 跑,有违规非零退出。
import { lintRelations } from "../src/lib/relation-lint";
const V = lintRelations();
if (!V.length) { console.log("✅ 关系准入 lint 全过,无违规"); process.exit(0); }
console.log(`✗ ${V.length} 处违规:`);
const byRule: Record<string, typeof V> = {};
for (const v of V) (byRule[v.rule] ??= []).push(v);
for (const [rule, vs] of Object.entries(byRule)) {
  console.log(`\n  [${rule}] ${vs.length} 处`);
  vs.slice(0, 12).forEach((v) => console.log(`    ${v.name}[${v.code}] ${v.chainId}${v.detail ? " · " + v.detail : ""}`));
}
process.exit(1);
