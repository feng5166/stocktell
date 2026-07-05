// resolver 关键样本快照测试(观察期 #2)。改数据/resolver 后跑,防串链/漏映射回归。
import { resolvePrimary, resolveInChain } from "../src/lib/relation-resolver";
let fails = 0;
const eq = (name: string, got: unknown, want: unknown) => {
  const ok = got === want;
  console.log(`  ${ok ? "✓" : "✗"} ${name}: ${got}${ok ? "" : ` (期望 ${want})`}`);
  if (!ok) fails++;
};
const lc = resolvePrimary("000977"); eq("浪潮 chainId", lc?.chainId, "ai-infra"); eq("浪潮 relationType", lc?.relationType, "direct");
const zj = resolvePrimary("300308"); eq("中际 chainId", zj?.chainId, "ai-infra"); eq("中际 segment", zj?.segmentName, "光模块/高速互连"); eq("中际 relationType", zj?.relationType, "direct");
eq("英维克 电力=direct(不串链)", resolveInChain("002837", "data-center-power")?.relationType, "direct");
eq("英维克 ai=indirect(不串链)", resolveInChain("002837", "ai-infra")?.relationType, "indirect");
const js = resolvePrimary("688111"); eq("金山 应用侧 relationType", js?.relationType, "indirect"); eq("金山 chainId", js?.chainId, "ai-infra");
const etn = resolvePrimary("ETN"); eq("Eaton relationType", etn?.relationType, "trigger"); eq("Eaton chainId", etn?.chainId, "data-center-power");
eq("北方华创 已移出→null(前台显待验证不静默)", resolvePrimary("002371"), null);
console.log(fails === 0 ? "\n✅ resolver 关键样本全过" : `\n✗ ${fails} 项不符`);
process.exit(fails === 0 ? 0 : 1);
