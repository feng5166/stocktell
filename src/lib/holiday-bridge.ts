// Holiday Bridge Brief · 节后首日观察(2.1-C,2026-07-07 负责人拍板)。
// 美股长假导致 A 股交易日没有新隔夜映射时,不硬造"隔夜简报",但也不让页面纯空——
// 给一份「美股休市后首个 A 股交易日观察」:最近有效美股交易日回顾 + 产业链关注环节与验证点。
//
// 三条铁律在这里的落法:
// - 不硬造:全部素材来自【已存在的真数据】——recap=最近一期已发布简报(当时已过审),
//   chainWatch=chains.ts 静态环节与 verifyTemplate(拍板⑨的验证点模板)。零 LLM 零检索,
//   假期消息聚合列 2.1 后续增强(博查检索返回的是当下网页,做不了严格历史,先不做)。
// - 不伪装:状态=market_closed + subType=holiday_bridge,标题口径写明"无新的隔夜美股映射",
//   绝不标 generated。
// - 合规纵深:新拼散文全查(禁词+数字红线),recap 回顾标题只查禁词(已过审事实记录,
//   数字是事实复述——见 buildHolidayBridge 内注释);blockers 非空则不发布,回退纯 market_closed。
//
// 存储:复用 quotesCache KV(id=holiday-bridge:{date}),与 brief-status 同仓,零新表。
// buildHolidayBridge 是纯函数(素材注入式,不读写库)——replay 直接调,不需要 DB。
import type { BriefingItem } from "@/lib/briefings";
import { CHAINS, FALLBACK_SEGMENT } from "@/data/chains";
import { scanBannedWords, isComplianceClean } from "@/lib/content-guard";
import { kvGet, kvSet } from "@/lib/kv";

export type HolidayBridgeDoc = {
  date: string; // 北京简报日(A 股交易日、美股休市)
  fallbackFromDate: string; // 最近有效美股交易日(回顾素材来源)
  title: string;
  note: string; // 口径声明(必须让用户知道这不是新隔夜简报)
  recap: Array<{
    title: string;
    impact: string;
    beneficiaries: Array<{ code: string; name: string }>;
  }>;
  chainWatch: Array<{
    chainId: string;
    chainName: string;
    segments: Array<{ name: string; plain: string; verify: string[] }>;
  }>;
  guard: { blockers: string[] };
  at?: string;
};

export const BRIDGE_TITLE = "美股休市后首个 A 股交易日观察";
export const bridgeNote = (fallbackFromDate: string) =>
  `今日无新的隔夜美股映射,以下基于最近有效美股交易日(${fallbackFromDate})的简报与产业链关注点整理,不构成投资建议。`;

// 纯构建(不读写库):素材注入式,调用方负责给出最近一期已发布简报。
// recapItems 为空时返回 null——没有真素材就不出 bridge(宁缺勿造),保持纯 market_closed。
export function buildHolidayBridge(opts: {
  date: string;
  fallbackFromDate: string;
  recapItems: BriefingItem[];
}): HolidayBridgeDoc | null {
  if (!opts.recapItems.length || !opts.fallbackFromDate) return null;
  const recap = opts.recapItems.slice(0, 8).map((it) => ({
    title: it.title,
    impact: it.impact,
    beneficiaries: (it.beneficiaries ?? []).map((b) => ({ code: b.code, name: b.name })),
  }));
  // 链级观察:配置链的环节 + 验证点模板(FALLBACK_SEGMENT 是兜底段,不进观察列表)
  const chainWatch = Object.values(CHAINS)
    .filter((c) => c.segments?.length)
    .map((c) => ({
      chainId: c.id,
      chainName: c.name,
      segments: (c.segments ?? [])
        .filter((s) => s.name !== FALLBACK_SEGMENT)
        .map((s) => ({ name: s.name, plain: s.plain, verify: s.verifyTemplate })),
    }));
  const note = bridgeNote(opts.fallbackFromDate);
  // 合规纵深,两套口径(review F1):
  // ①我们新拼的散文(标题/口径/环节文案/验证点)→ 禁词 + 涨跌数字红线全查(isComplianceClean);
  // ②recap 回顾标题 = 已发布已过审的【事实记录】,生产标题设计上就含涨跌百分比
  //   (模板题「隔夜上涨 3.10%」)——对历史事实复述数字不是新观点,只扫禁词不扫数字红线,
  //   与 guard.ts 对外部来源标题(externalText)的既有先例同口径。全查会让桥在真实数据下必被自拦。
  const ourProse = [
    BRIDGE_TITLE,
    note,
    ...chainWatch.flatMap((cw) => cw.segments.flatMap((s) => [s.name, s.plain, ...s.verify])),
  ].join("\n");
  const blockers: string[] = [];
  const own = isComplianceClean(ourProse);
  if (own.bannedHits.length) blockers.push(`禁词命中:${own.bannedHits.join("、")}`);
  if (own.hasNumber) blockers.push("命中具体涨跌数字红线");
  const recapHits = scanBannedWords(recap.map((r) => r.title).join("\n"));
  if (recapHits.length) blockers.push(`禁词命中(回顾标题):${recapHits.join("、")}`);
  return {
    date: opts.date,
    fallbackFromDate: opts.fallbackFromDate,
    title: BRIDGE_TITLE,
    note,
    recap,
    chainWatch,
    guard: { blockers },
  };
}

const KEY = (date: string) => `holiday-bridge:${date}`;

// 存取走 lib/kv.ts(fail-safe:bridge 失败绝不影响 market_closed 主状态写入)。
export async function saveHolidayBridge(doc: HolidayBridgeDoc): Promise<void> {
  await kvSet(KEY(doc.date), doc as object);
}

export async function getHolidayBridge(date: string): Promise<HolidayBridgeDoc | null> {
  return kvGet<HolidayBridgeDoc>(KEY(date));
}
