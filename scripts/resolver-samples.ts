// resolver 关键样本快照测试(观察期 #2 + P1 收尾 P1-3 严格 remove 口径)。
// 改数据/resolver 后跑,防串链/漏映射/旧源漏读回归。CI blocking。
import { resolvePrimary, resolveInChain } from "../src/lib/relation-resolver";
let fails = 0;
const eq = (name: string, got: unknown, want: unknown) => {
  const ok = got === want;
  console.log(`  ${ok ? "✓" : "✗"} ${name}: ${got}${ok ? "" : ` (期望 ${want})`}`);
  if (!ok) fails++;
};

// 推理核心 direct(不变)
const lc = resolvePrimary("000977"); eq("浪潮 chainId", lc?.chainId, "ai-infra"); eq("浪潮 relationType", lc?.relationType, "direct");
const zj = resolvePrimary("300308"); eq("中际 chainId", zj?.chainId, "ai-infra"); eq("中际 segment", zj?.segmentName, "光模块/高速互连"); eq("中际 relationType", zj?.relationType, "direct");

// P1-3:电力股严格 remove——英维克只在电力链 direct,【不在 ai-infra】
eq("英维克 电力=direct", resolveInChain("002837", "data-center-power")?.relationType, "direct");
eq("英维克 ai-infra 应为 null(已 remove,不串链)", resolveInChain("002837", "ai-infra"), null);
eq("盛弘 ai-infra 应为 null", resolveInChain("300693", "ai-infra"), null);

// P1-3:AI 应用不挂 ai-infra——金山归 ai-application indirect,【不在 ai-infra】
eq("金山 ai-application=indirect", resolveInChain("688111", "ai-application")?.relationType, "indirect");
eq("金山 ai-infra 应为 null(不被 ai-infra 承载)", resolveInChain("688111", "ai-infra"), null);

// trigger + 移出票
const etn = resolvePrimary("ETN"); eq("Eaton relationType", etn?.relationType, "trigger"); eq("Eaton chainId", etn?.chainId, "data-center-power");
eq("北方华创 移出→null(不被 ai-infra 旧源捞回、不静默)", resolvePrimary("002371"), null);

console.log(fails === 0 ? "\n✅ resolver 关键样本全过" : `\n✗ ${fails} 项不符`);
process.exit(fails === 0 ? 0 : 1);
