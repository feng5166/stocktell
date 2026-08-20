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

// 2026-08-20 先进封装拆分:封测与材料分段,新上市盛合晶微入池;
// 普通半导体材料/特气不得再靠 sector 粗筛进入先进封装关系。
eq("盛合晶微 ai-infra=indirect", resolveInChain("688820", "ai-infra")?.relationType, "indirect");
eq("盛合晶微 segment=先进封装/封测", resolveInChain("688820", "ai-infra")?.segmentName, "先进封装/封测");
eq("华海诚科 segment=先进封装材料", resolveInChain("688535", "ai-infra")?.segmentName, "先进封装材料");
eq("华特气体不进入先进封装关系", resolveInChain("688268", "ai-infra"), null);

// P1-3:AI 应用不挂 ai-infra——金山归 ai-application indirect,【不在 ai-infra】
eq("金山 ai-application=indirect", resolveInChain("688111", "ai-application")?.relationType, "indirect");
eq("金山 ai-infra 应为 null(不被 ai-infra 承载)", resolveInChain("688111", "ai-infra"), null);

// trigger + 移出票
const etn = resolvePrimary("ETN"); eq("Eaton relationType", etn?.relationType, "trigger"); eq("Eaton chainId", etn?.chainId, "data-center-power");

// 2.2-B(2026-07-07 扩链):半导体设备与先进制程链——北方华创从"移出即 null"升级为
// "归新链 candidate 且【仍不在 ai-infra】"(不污染 ai-infra 的语义不变,只是有家了)。
const bfhc = resolvePrimary("002371");
eq("北方华创 chainId=semiconductor-equipment", bfhc?.chainId, "semiconductor-equipment");
eq("北方华创 relationType=direct(2026-07-07 负责人终审采纳)", bfhc?.relationType, "direct");
eq("北方华创 ai-infra 应为 null(不被旧源捞回)", resolveInChain("002371", "ai-infra"), null);
// 触发源路由:ASML 归半导体设备链 trigger(audit 未来链启用)
const asml = resolvePrimary("ASML");
eq("ASML chainId=semiconductor-equipment", asml?.chainId, "semiconductor-equipment");
eq("ASML relationType=trigger", asml?.relationType, "trigger");
// EDA:华大九天在新链 candidate,不挂 ai-infra
eq("华大九天 semiconductor-equipment=candidate(未终审,维持)", resolveInChain("301269", "semiconductor-equipment")?.relationType, "candidate");
eq("中微 semiconductor-equipment=direct(终审采纳)", resolveInChain("688012", "semiconductor-equipment")?.relationType, "direct");
eq("华大九天 ai-infra 应为 null", resolveInChain("301269", "ai-infra"), null);
// 2.2-B 第二批:KLAC 触发源 + 精测/概伦 candidate
const klac = resolvePrimary("KLAC");
eq("KLAC chainId=semiconductor-equipment", klac?.chainId, "semiconductor-equipment");
eq("KLAC relationType=trigger", klac?.relationType, "trigger");
eq("精测电子 semi=candidate(待终审)", resolveInChain("300567", "semiconductor-equipment")?.relationType, "candidate");
eq("概伦电子 semi=direct(07-07 二次终审)", resolveInChain("688206", "semiconductor-equipment")?.relationType, "direct");
eq("盛美上海 semi=direct(07-07 二次终审)", resolveInChain("688082", "semiconductor-equipment")?.relationType, "direct");
eq("长川科技 semi=indirect(07-07 二次终审:测试设备隔一层)", resolveInChain("300604", "semiconductor-equipment")?.relationType, "indirect");
eq("华大九天 semi=candidate(负责人保留)", resolveInChain("301269", "semiconductor-equipment")?.relationType, "candidate");

// 2026-07-30 华为产业生态链(一批入池 + 当日终审,负责人授权按四字段标准自动化判定):
// 拓维自 ai-infra sentiment 移档(audit 原建议即"更偏华为生态");中芯为推理假设档,
// 【sentiment 是终审上限】——出现官方披露前任何改动把它升档都应在此红出。
const tw = resolvePrimary("002261");
eq("拓维 chainId=huawei-ecosystem(自 ai-infra 移档)", tw?.chainId, "huawei-ecosystem");
eq("拓维 ai-infra 应为 null(移档后不串链)", resolveInChain("002261", "ai-infra"), null);
eq("拓维 huawei=indirect(07-30 终审)", resolveInChain("002261", "huawei-ecosystem")?.relationType, "indirect");
eq("赛力斯 huawei=direct(07-30 终审:四字段全中,本链唯一 direct)", resolveInChain("601127", "huawei-ecosystem")?.relationType, "direct");
eq("中芯国际 huawei=sentiment(推理假设=终审上限,无官方披露不得升)", resolveInChain("688981", "huawei-ecosystem")?.relationType, "sentiment");
eq("常山北明 huawei=sentiment(07-30 终审:无业务暴露入口)", resolveInChain("000158", "huawei-ecosystem")?.relationType, "sentiment");
eq("软通动力 huawei=indirect(07-30 终审)", resolveInChain("301236", "huawei-ecosystem")?.relationType, "indirect");
// 交叉引用不串链:光迅/深南关系档仍归 ai-infra,不在华为链
eq("光迅 huawei 应为 null(关系档归 ai-infra)", resolveInChain("002281", "huawei-ecosystem"), null);
eq("深南 huawei 应为 null(关系档归 ai-infra)", resolveInChain("002916", "huawei-ecosystem"), null);

console.log(fails === 0 ? "\n✅ resolver 关键样本全过" : `\n✗ ${fails} 项不符`);
process.exit(fails === 0 ? 0 : 1);
