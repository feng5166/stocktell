// Watchlist 端到端冒烟(三轮 review 贯穿性建议:trigger 信号/ETF/未覆盖三类断链
// 都是"模块各自正确、拼起来断",单测测不出)。零网络零 DB,挂 relations-check blocking。
// 覆盖链路 = 服务端数据装配(chainMap/triggerMap/names/signals)→ 分组纯函数(与 Board 共用)
// → 四组各自的展示不变量。
import { STOCKS } from "../src/data/stocks";
import { ETFS } from "../src/data/etfs";
import { buildWatchChainMap } from "../src/lib/watch-relation";
import { resolvePrimary } from "../src/lib/relation-resolver";
import { signalsFromItems } from "../src/lib/daily-signals";
import { classifyWatchCodes, type WatchNames, type WatchSignals } from "../src/lib/watch-groups";
import { SIGNAL_RANK } from "../src/lib/signal-rank";
import type { BriefingItem } from "../src/lib/briefings";

let fails = 0;
const eq = (name: string, got: unknown, want: unknown) => {
  const ok = got === want;
  console.log(`  ${ok ? "✓" : "✗"} ${name}: ${String(got)}${ok ? "" : `(期望 ${String(want)})`}`);
  if (!ok) fails++;
};

// ---- 服务端装配(与 app/watchlist/page.tsx 同款逻辑)----
const chainMap = buildWatchChainMap();
const names: WatchNames = {};
for (const s of STOCKS) names[s.code] = { name: s.name, market: s.market };
for (const e of ETFS) names[e.code] = { name: e.name, market: "ETF" };
const triggerMap: Record<string, { chainName: string }> = {};
for (const s of STOCKS) {
  if (s.market !== "美股") continue;
  const p = resolvePrimary(s.code);
  if (p?.relationType === "trigger") triggerMap[s.code] = { chainName: p.chainName };
}
// 今日信号:fixture 简报(NVDA 触发 → 受益北方华创)
const fixture = [
  {
    id: "smoke-1", date: "2026-07-07", impact: "高", title: "英伟达隔夜异动(冒烟 fixture)",
    triggerCode: "NVDA", triggerName: "英伟达", triggerChange: 5,
    beneficiaries: [{ code: "002371", name: "北方华创" }],
    retailTake: "", sourceUrl: null, status: "published", createdAt: "",
  },
] as unknown as BriefingItem[];
const signals = signalsFromItems(fixture, "2026-07-07");
const signalMap: WatchSignals = {};
for (const s of signals) {
  const prev = signalMap[s.code];
  if (!prev || SIGNAL_RANK[s.signalStrength] > SIGNAL_RANK[prev.strength as keyof typeof SIGNAL_RANK]) {
    signalMap[s.code] = { strength: s.signalStrength, note: s.note ?? "" };
  }
}

// ---- 用户自选:美股触发源 + ETF + A股(半导体链)+ A股(AI链)+ 未知码 ----
const etfCode = ETFS[0]?.code ?? "159995";
const watch = ["NVDA", etfCode, "002371", "300308", "UNKNOWN9"];
const groups = classifyWatchCodes(watch, chainMap, triggerMap, names, signalMap);

console.log("=== Watchlist 冒烟 ===");
// ① 触发源:NVDA 必须在触发源组(有核定档,绝不落"待验证"),且今日信号点亮
eq("NVDA 在触发源组", groups.triggers.includes("NVDA"), true);
eq("NVDA 不在待验证组(三轮 T4 回归哨)", groups.uncovered.includes("NVDA"), false);
eq("NVDA 今日信号点亮", signalMap["NVDA"]?.strength, "强");
// ② ETF:独立组,不落待验证(不给死流程)
eq(`ETF ${etfCode} 在 ETF 组`, groups.etfs.includes(etfCode), true);
eq("ETF 不在待验证组(三轮 T5 回归哨)", groups.uncovered.includes(etfCode), false);
// ③ A股链分组:北方华创(半导体 direct)与中际旭创(ai-infra direct)各归各链
const chainIds = groups.chains.map(([id]) => id);
eq("半导体链分组存在", chainIds.includes("semiconductor-equipment"), true);
eq("ai-infra 链分组存在", chainIds.includes("ai-infra"), true);
const semi = groups.chains.find(([id]) => id === "semiconductor-equipment")?.[1];
eq("北方华创在半导体组", semi?.rows.some((r) => r.code === "002371"), true);
eq("北方华创信号点亮(受益联动)", signalMap["002371"]?.strength, "强");
// ④ 有触发的链排前(北方华创有信号 → 半导体组应在 ai-infra 前)
eq("有触发的链置顶", chainIds[0], "semiconductor-equipment");
// ⑤ 未知码:落待验证组常驻(不消失)
eq("未知码在待验证组", groups.uncovered.includes("UNKNOWN9"), true);

console.log(fails === 0 ? "\n✅ Watchlist 冒烟全过" : `\n✗ ${fails} 项不符`);
process.exit(fails === 0 ? 0 : 1);
