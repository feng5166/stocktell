// AI 应用事件触发源池(P1.1;负责人 2026-07-03 拍板范围)。
// ⚠️ 独立于 A 股关系池(STOCKS)——这些是【海外事件源公司】,只用于事件分类与 insight 路由,
// 不是 A 股映射标的,绝不进关系卡/成分池。用途:Palantir/ServiceNow 等事件出现时,把用户带到
// 「为什么不等于国内 AI 应用受益」(/insight/ai-application),点破"同题材≠有传导"。
export type EventTriggerSource = {
  ticker: string;
  name: string;
  market: "US" | "HK" | "CN";
  triggerGroup: "ai-application";
  triggerStrength: "strong" | "medium";
  routeToInsight: string;
};

export const TRIGGER_SOURCES: EventTriggerSource[] = [
  // 强触发源:本身就是企业级 AI 应用公司,事件涉及 AI 即路由
  { ticker: "PLTR", name: "Palantir", market: "US", triggerGroup: "ai-application", triggerStrength: "strong", routeToInsight: "ai-application" },
  { ticker: "NOW", name: "ServiceNow", market: "US", triggerGroup: "ai-application", triggerStrength: "strong", routeToInsight: "ai-application" },
  // 中触发源:软件/SaaS 巨头,须【明确 AI 商业化内容】才路由(否则普通财报/涨跌/评级不触发)
  { ticker: "MSFT", name: "Microsoft", market: "US", triggerGroup: "ai-application", triggerStrength: "medium", routeToInsight: "ai-application" },
  { ticker: "ORCL", name: "Oracle", market: "US", triggerGroup: "ai-application", triggerStrength: "medium", routeToInsight: "ai-application" },
  { ticker: "SNOW", name: "Snowflake", market: "US", triggerGroup: "ai-application", triggerStrength: "medium", routeToInsight: "ai-application" },
  { ticker: "ADBE", name: "Adobe", market: "US", triggerGroup: "ai-application", triggerStrength: "medium", routeToInsight: "ai-application" }, // 待补入股池,补后自动生效
  { ticker: "CRM", name: "Salesforce", market: "US", triggerGroup: "ai-application", triggerStrength: "medium", routeToInsight: "ai-application" }, // 待补入股池
];

// AI 关键词分级:强触发源命中【宽 AI 词】即可(它本就是 AI 应用公司);
// 中触发源须命中【AI 商业化词】(更严,防普通软件股涨跌/财报误触发)。
// 英文词加词界锚定:/AI/ 别命中 gains/chain/retail/email 里的 ai;「智能体」别吃「智能体验」。
const AI_BROAD =
  /(?<![A-Za-z])(?:AI|LLM|GPT|Copilot|Agent)(?![A-Za-z])|人工智能|大模型|生成式|智能体(?!验)/i;
const AI_COMMERCIAL =
  /(?<![A-Za-z])AI(?![A-Za-z])[^。,,;;、\n]{0,8}(收入|订单|营收|付费|订阅|商业化|落地|采用|revenue|subscription|ARR|adoption|workload)|(收入|订单|营收|付费|订阅|商业化)[^。,,;;、\n]{0,8}(?<![A-Za-z])AI(?![A-Za-z])|企业级\s*AI|enterprise\s*AI|(?<![A-Za-z])Copilot(?![A-Za-z])|智能体(?!验)|客户采用|customer\s*adoption|商业化落地/i;

const bySymbol = new Map(TRIGGER_SOURCES.map((s) => [s.ticker, s]));

// 事件 → 应用链 insight 路由。命中返回入口;否则 null(普通软件股涨跌 / 财报 / 评级目标价不触发)。
// 文案用「为什么不等于国内 AI 应用受益」——不用"看怎么传导"(这页核心就是没有直接传导)。
// 判定只吃【事件字段】(title + triggerName),【不吃 retailTake】——模板 retailTake 会注入领头
// A 股 peer 的 sector/observation(如 PLTR 的 peer 科大讯飞恒含「大模型」),会让纯涨跌事件假命中。
export function routeInsightForItem(item: {
  triggerCode: string | null;
  title: string;
  triggerName?: string | null;
}): { slug: string; label: string } | null {
  if (!item.triggerCode) return null;
  const src = bySymbol.get(item.triggerCode);
  if (!src) return null;
  const text = `${item.title} ${item.triggerName ?? ""}`;
  const hit = src.triggerStrength === "strong" ? AI_BROAD.test(text) : AI_COMMERCIAL.test(text);
  if (!hit) return null;
  return { slug: src.routeToInsight, label: "为什么不等于国内 AI 应用受益" };
}
