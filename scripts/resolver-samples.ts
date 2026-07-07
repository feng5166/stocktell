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

// 2.2-B(2026-07-07 扩链):半导体设备与先进制程链——北方华创从"移出即 null"升级为
// "归新链 candidate 且【仍不在 ai-infra】"(不污染 ai-infra 的语义不变,只是有家了)。
const bfhc = resolvePrimary("002371");
eq("北方华创 chainId=semiconductor-equipment", bfhc?.chainId, "semiconductor-equipment");
eq("北方华创 relationType=candidate(待人工校准,不虚标)", bfhc?.relationType, "candidate");
eq("北方华创 ai-infra 应为 null(不被旧源捞回)", resolveInChain("002371", "ai-infra"), null);
// 触发源路由:ASML 归半导体设备链 trigger(audit 未来链启用)
const asml = resolvePrimary("ASML");
eq("ASML chainId=semiconductor-equipment", asml?.chainId, "semiconductor-equipment");
eq("ASML relationType=trigger", asml?.relationType, "trigger");
// EDA:华大九天在新链 candidate,不挂 ai-infra
eq("华大九天 semiconductor-equipment=candidate", resolveInChain("301269", "semiconductor-equipment")?.relationType, "candidate");
eq("华大九天 ai-infra 应为 null", resolveInChain("301269", "ai-infra"), null);

console.log(fails === 0 ? "\n✅ resolver 关键样本全过" : `\n✗ ${fails} 项不符`);
process.exit(fails === 0 ? 0 : 1);
