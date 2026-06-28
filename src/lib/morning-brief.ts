// 个性化盘前早报:把"用户今天和自选相关的简报条目"综合成一段人话早报。
// 用于邮件(digest)/微信(push-weixin)推送顶部,以及网页「和我相关」顶部。
// 没配 LLM 时降级为规则概览,绝不喊买卖、不出现用户名字。
import crypto from "crypto";
import { getLLM, LLM_MODEL } from "@/lib/llm";
import { getPrisma } from "@/lib/prisma";
import { todayISO } from "@/lib/date";
import type { BriefingItem } from "@/lib/briefings";

const BRIEF_PROMPT = `你是 StockTell 的盘前早报助手,面向看不懂产业链的散户。
我会给你某用户今天「和他自选相关」的简报条目,你写一段个性化早报:
- 口语、像朋友顺手提醒,直接说事,不要出现任何称呼或人名。
- 先一句整体概览(今天你的票整体什么情况/偏强偏弱),再点出最该注意的 1-2 只或 1-2 件事。
- 只讲传导逻辑与风险提示,绝不喊买卖、不给操作建议(不出现"买入/卖出/加仓/抄底"等)。
- 自然收尾,口径中性;≤120 字,2-4 句。
只输出早报正文,不要 JSON、不要 markdown、不要逐条列表符号。`;

function fallback(items: BriefingItem[]): string {
  const list = items.map((it) => it.title).join(";");
  return `今天你的自选有 ${items.length} 条相关动态:${list}。(以上为信息整理,不构成投资建议)`;
}

// 纯生成(无缓存)。调用方一般用 getMorningBrief 走每日缓存。
export async function buildMorningBrief(items: BriefingItem[]): Promise<string> {
  if (items.length === 0) return fallback(items);
  const client = getLLM();
  if (!client) return fallback(items);

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
          content: `今天和你相关的简报条目(JSON):\n${JSON.stringify(
            payload,
            null,
            2
          )}\n\n请写这段早报。`,
        },
      ],
    });
    const txt = resp.choices[0]?.message?.content?.trim();
    return txt && txt.length > 0 ? txt : fallback(items);
  } catch {
    return fallback(items);
  }
}

// 带每日缓存:key = 当天日期 + 自选组合 hash。
// 同一天、同一组自选只真正生成一次(走 DB 全局缓存 morning_brief_cache),不重复打大模型。
export async function getMorningBrief(
  codes: string[],
  items: BriefingItem[]
): Promise<string> {
  const date = todayISO();
  const sig = Array.from(new Set(codes)).sort().join(",");
  const hash = crypto.createHash("sha256").update(sig).digest("hex").slice(0, 24);
  const key = `${date}:${hash}`;

  const db = getPrisma();
  if (db) {
    try {
      const row = await db.morningBriefCache.findUnique({ where: { key } });
      if (row) return row.brief; // 当天已生成 → 直接返回,不打模型
    } catch {
      /* 读缓存失败不致命,继续实时生成 */
    }
  }

  const brief = await buildMorningBrief(items);

  if (db) {
    try {
      await db.morningBriefCache.upsert({
        where: { key },
        create: { key, brief },
        update: { brief, updatedAt: new Date() },
      });
    } catch {
      /* 写缓存失败不致命 */
    }
  }
  return brief;
}
