// 个性化盘前早报:把"用户今天和自选相关的简报条目"综合成一段人话早报。
// 用于邮件(digest)/微信(push-weixin)推送顶部,以及网页「和我相关」顶部。
// 没配 LLM 时降级为规则概览,绝不喊买卖、不出现用户名字。
import crypto from "crypto";
import { getLLM } from "@/lib/llm";
import { getPrisma } from "@/lib/prisma";
import { todayISO } from "@/lib/date";
import { fundFlowFor } from "@/lib/fund-flow";
import type { BriefingItem } from "@/lib/briefings";

const BRIEF_PROMPT = `你是 StockTell 的盘前早报助手,面向看不懂产业链的散户。你的角色是"懂行、靠谱、会说人话的盯盘搭子",帮用户稳住情绪,而不是制造焦虑。
我会给你某用户今天「和他自选相关」的简报条目,你写一段个性化早报:
- 口语、像朋友顺手提醒,直接说事,不要出现任何称呼或人名。
- 先一句整体概览(今天你的票整体什么情况/偏强偏弱),再点出最该注意的 1-2 只或 1-2 件事。
- 只讲传导逻辑与风险提示,绝不喊买卖、不给操作建议(不出现"买入/卖出/加仓/抄底"等)。
- 语气陪伴、平稳,不渲染恐慌:禁用"暴跌/崩盘/血洗/重挫/恐慌性抛售/利空出尽"等情绪化吓人词,改用中性词(回调/走弱/承压/反弹/企稳/分化)。
- 行情不好时也帮用户冷静看待(如提示"别被情绪带着走、先看企稳没"),但不打包票、不安慰式承诺。
- 若提供了资金面数据,自然融入 1 句(如主力大幅净流出、融资明显加仓、上了龙虎榜),中性措辞,别堆数字、别下结论。
- 自然收尾,口径中性;**务必把话说完整、自然结尾,不要写一半**;140~220 字,3-5 句。
只输出早报正文,不要 JSON、不要 markdown、不要逐条列表符号。`;

function fallback(items: BriefingItem[]): string {
  const list = items.map((it) => it.title).join(";");
  return `今天你的自选有 ${items.length} 条相关动态:${list}。(以上为信息整理,不构成投资建议)`;
}

// 纯生成(无缓存)。调用方一般用 getMorningBrief 走每日缓存。
export async function buildMorningBrief(
  codes: string[],
  items: BriefingItem[]
): Promise<string> {
  if (items.length === 0) return fallback(items);
  const client = getLLM();
  if (!client) return fallback(items);

  const payload = items.map((it) => ({
    impact: it.impact,
    title: it.title,
    beneficiaries: it.beneficiaries.map((b) => b.name),
    retailTake: it.retailTake,
  }));

  // 资金面(可选,拿不到就只用简报,不致命)
  let fund: {
    name: string;
    主力净流入亿: number | null;
    融资余额变化亿: number | null;
    龙虎榜: string | null;
  }[] = [];
  try {
    // 资金面慢(Tushare 按日大表)就不等了:4s 超时则跳过,早报照常生成(只用简报)。
    const ff = await Promise.race([
      fundFlowFor(codes),
      new Promise<null>((resolve) => setTimeout(() => resolve(null), 4000)),
    ]);
    if (ff) {
      fund = ff.items
        .filter((x) => x.netMf !== null || x.longhu || x.rzChgYi !== null)
        .map((x) => ({
          name: x.name,
          主力净流入亿: x.netMf,
          融资余额变化亿: x.rzChgYi,
          龙虎榜: x.longhu ? `净额${x.longhu.net}亿·${x.longhu.reason}` : null,
        }));
    }
  } catch {
    /* 资金面拿不到就只用简报 */
  }

  const userContent =
    `今天和你相关的简报条目(JSON):\n${JSON.stringify(payload, null, 2)}` +
    (fund.length
      ? `\n\n你的自选最新资金面(亿元,负=主力流出/融资减仓):\n${JSON.stringify(
          fund,
          null,
          2
        )}`
      : "") +
    `\n\n请写这段早报。`;

  try {
    const resp = await client.chat.completions.create({
      // 早报是短文本,用非推理的 flash:快、且不会被 reasoning 吃掉 token 截断正文。
      model: process.env.BRIEF_LLM_MODEL || "deepseek-v4-flash",
      max_tokens: 700,
      messages: [
        { role: "system", content: BRIEF_PROMPT },
        { role: "user", content: userContent },
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
  const key = `v2:${date}:${hash}`; // v2:换 flash 模型 + 更完整文案,绕过旧截断缓存

  const db = getPrisma();
  if (db) {
    try {
      const row = await db.morningBriefCache.findUnique({ where: { key } });
      if (row) return row.brief; // 当天已生成 → 直接返回,不打模型
    } catch {
      /* 读缓存失败不致命,继续实时生成 */
    }
  }

  const brief = await buildMorningBrief(codes, items);

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
