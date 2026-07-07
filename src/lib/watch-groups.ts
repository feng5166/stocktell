// Watchlist 四分流(三轮 review 贯穿性建议落地:断链类缺陷"模块各自正确、拼起来断"
// 单测测不出——把 Board 内联的分组逻辑抽成纯函数,scripts/watchlist-smoke.ts 端到端断言,
// 挂 CI blocking)。WatchlistBoard 与冒烟脚本共用本函数,UI 与测试不会漂移。
import type { WatchChainInfo } from "@/lib/watch-relation";
import { SIGNAL_RANK } from "@/lib/signal-rank";

export type WatchNames = Record<string, { name: string; market: string }>;
export type WatchSignals = Record<string, { strength: string; note: string }>;

export type WatchGroups = {
  chains: Array<[string, { chainName: string; rows: Array<{ code: string; info: WatchChainInfo }> }]>;
  triggers: string[];
  etfs: string[];
  uncovered: string[];
};

const rank = (signalMap: WatchSignals, code: string) =>
  SIGNAL_RANK[(signalMap[code]?.strength ?? "") as keyof typeof SIGNAL_RANK] ?? 0;

// 分流规则(不变量):A 股三档→链分组;美股 trigger→触发源组(有核定档,绝不落"待验证");
// ETF→独立组(不进关系模型,不给死流程);其余→待验证组(也读信号:未覆盖≠今天没被提到)。
export function classifyWatchCodes(
  codes: string[],
  chainMap: Record<string, WatchChainInfo>,
  triggerMap: Record<string, { chainName: string }>,
  names: WatchNames,
  signalMap: WatchSignals
): WatchGroups {
  const byChain = new Map<string, { chainName: string; rows: Array<{ code: string; info: WatchChainInfo }> }>();
  const triggers: string[] = [];
  const etfs: string[] = [];
  const uncovered: string[] = [];
  for (const code of codes) {
    const info = chainMap[code];
    if (info) {
      const g = byChain.get(info.chainId) ?? { chainName: info.chainName, rows: [] };
      g.rows.push({ code, info });
      byChain.set(info.chainId, g);
    } else if (triggerMap[code]) {
      triggers.push(code);
    } else if (names[code]?.market === "ETF") {
      etfs.push(code);
    } else {
      uncovered.push(code);
    }
  }
  const byName = (a: string, b: string) =>
    (names[a]?.name ?? a).localeCompare(names[b]?.name ?? b, "zh");
  const sig = (c: string) => rank(signalMap, c);
  for (const g of Array.from(byChain.values())) {
    g.rows.sort((a, b) => sig(b.code) - sig(a.code) || byName(a.code, b.code));
  }
  const chains = Array.from(byChain.entries()).sort(
    (a, b) =>
      Math.max(0, ...b[1].rows.map((r) => sig(r.code))) -
      Math.max(0, ...a[1].rows.map((r) => sig(r.code)))
  );
  triggers.sort((a, b) => sig(b) - sig(a) || byName(a, b));
  etfs.sort(byName);
  uncovered.sort((a, b) => sig(b) - sig(a) || byName(a, b));
  return { chains, triggers, etfs, uncovered };
}
