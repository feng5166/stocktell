// 个性化盘前早报:把"用户今天和自选相关的简报条目"综合成一段人话早报。
// 用于邮件(digest)/微信(push-weixin)推送顶部,以及网页「和我相关」顶部。
// 没配 LLM 时降级为规则概览,绝不喊买卖。
import { getLLM, LLM_MODEL } from "@/lib/llm";
import type { BriefingItem } from "@/lib/briefings";

const BRIEF_PROMPT = `你是 StockTell 的盘前早报助手,面向看不懂产业链的散户。
我会给你某用户今天「和他自选相关」的简报条目,你写一段个性化早报:
- 口语、像朋友顺手提醒,可用昵称开头。
- 先一句整体概览(今天你的票整体什么情况/偏强偏弱),再点出最该注意的 1-2 只或 1-2 件事。
- 只讲传导逻辑与风险提示,绝不喊买卖、不给操作建议(不出现"买入/卖出/加仓/抄底"等)。
- 自然收尾,口径中性;≤120 字,2-4 句。
只输出早报正文,不要 JSON、不要 markdown、不要逐条列表符号。`;

function fallback(nickname: string | null, items: BriefingItem[]): string {
  const head = `${nickname || "你好"},今天你的自选有 ${items.length} 条相关动态:`;
  const list = items.map((it) => it.title).join(";");
  return `${head}${list}。(以上为信息整理,不构成投资建议)`;
}

export async function buildMorningBrief(
  nickname: string | null,
  items: BriefingItem[]
): Promise<string> {
  if (items.length === 0) return fallback(nickname, items);
  const client = getLLM();
  if (!client) return fallback(nickname, items);

  const payload = items.map((it) => ({
    impact: it.impact,
    title: it.title,
    beneficiaries: it.beneficiaries.map((b) => b.name),
    retailTake: it.retailTake,
  }));
  try {
    const resp = await client.chat.completions.create({
      model: process.env.WHY_LLM_MODEL || LLM_MODEL,
      max_tokens: 400,
      messages: [
        { role: "system", content: BRIEF_PROMPT },
        {
          role: "user",
          content: `用户昵称:${nickname || "(未设)"}。\n今天和他相关的简报条目(JSON):\n${JSON.stringify(
            payload,
            null,
            2
          )}\n\n请写这段早报。`,
        },
      ],
    });
    const txt = resp.choices[0]?.message?.content?.trim();
    return txt && txt.length > 0 ? txt : fallback(nickname, items);
  } catch {
    return fallback(nickname, items);
  }
}
