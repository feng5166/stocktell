// 首页「今日产业链推理」数据组合器(首页改版 PRD §7)。
// 原则(拍板③):链的结构来自 insight(人工评审过的静态骨架),今天的判断来自
// chain-take(07:01 cron 生成)——既不每天静态复读,也不每天让 LLM 重写整条链。
// 服务端纯 DB 读 + 内存数据,零 LLM 零 fetch,不破坏首页 ISR(大陆 TTFB 约定)。
import { CHAINS } from "@/data/chains";
import { INSIGHT_CHAINS } from "@/data/insight-chains";
import { getChainTake, fallbackChainTake } from "@/lib/chain-take";
import type { BriefingItem } from "@/lib/briefings";
import type { Relation } from "@/data/insight-chains";

export interface HomeReasoningCard {
  chainId: string;
  chainName: string;
  insightSlug: string;
  date: string; // 内容所属期(回退时=最近一期)
  stale: boolean;
  trigger: string | null; // 今日触发概述,如「泛林半导体、迈威尔、相干 隔夜集体走弱」
  humanSummary: string | null; // 今日人话判断(chain-take);null=生成中
  tiers: { emoji: string; level: string; what: string; rel?: Relation }[]; // 三层环节(insight 结构)
  risk: string; // 一句话风险(今日侧:按当日触发方向生成,不再用 insight 演示事件的静态风险)
}

// 今日一句话风险(评审:不再用 insight 的演示事件静态风险——"AI 变便宜"前提和
// 当日集体下跌语境错位)。按当日触发方向给验证口径,下跌日文案=负责人定稿原句。
export function dailyRisk(items: BriefingItem[]): string {
  const ups = items.filter((it) => (it.triggerChange ?? 0) > 0).length;
  const downs = items.filter((it) => (it.triggerChange ?? 0) < 0).length;
  if (downs > 0 && ups === 0)
    return "海外下跌不等于国内订单恶化,需要订单、毛利率、资本开支验证。";
  if (ups > 0 && downs === 0)
    return "海外上涨不等于国内订单改善,映射能否兑现要看订单、毛利率、资本开支验证。";
  return "海外涨跌不直接等于国内订单变化,每条映射都要用订单、毛利率、资本开支验证。";
}

// 今日触发概述:取影响力最高的前 3 个触发标的 + 方向词。items 为空返回 null。
function triggerSummary(items: BriefingItem[]): string | null {
  const names: string[] = [];
  let up = 0;
  let down = 0;
  for (const it of items) {
    if (it.triggerName && !names.includes(it.triggerName)) names.push(it.triggerName);
    if ((it.triggerChange ?? 0) > 0) up++;
    else if ((it.triggerChange ?? 0) < 0) down++;
  }
  if (names.length === 0) return null;
  const dir =
    down > 0 && up === 0 ? "隔夜集体走弱" : up > 0 && down === 0 ? "隔夜集体走强" : "隔夜涨跌分化";
  return `${names.slice(0, 3).join("、")}${names.length > 3 ? " 等" : ""} ${dir}`;
}

// 组合因果链卡:遍历配置了 insightSlug 的链(P0 只有 ai 一条,后续加链自动进卡位)。
export async function buildReasoningCards(
  items: BriefingItem[],
  shownDate: string,
  stale: boolean
): Promise<HomeReasoningCard[]> {
  const cards: HomeReasoningCard[] = [];
  for (const chain of Object.values(CHAINS)) {
    if (!chain.insightSlug) continue;
    const insight = INSIGHT_CHAINS[chain.insightSlug];
    if (!insight) continue;
    // 今日判断:优先 cron 写的缓存;缺失用规则兜底;都没有则 null(卡片显示"生成中",不显示假内容)
    const take =
      (await getChainTake(chain.id, shownDate).catch(() => null)) ??
      fallbackChainTake(items);
    cards.push({
      chainId: chain.id,
      chainName: chain.name,
      insightSlug: chain.insightSlug,
      date: shownDate,
      stale,
      trigger: triggerSummary(items),
      humanSummary: take,
      tiers: insight.tldr.tiers.map((t) => ({
        emoji: t.emoji,
        level: t.level,
        what: t.what,
        rel: t.rel,
      })),
      risk: dailyRisk(items),
    });
  }
  return cards;
}
