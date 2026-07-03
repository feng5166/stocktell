// 链级「今日一句话判断」(2026-07-03 链页评审拍板 P0-1):
// 综合当日简报条目,回答 ①今天这条链为什么偏强/偏弱 ②传导最直接的环节 ③哪些只是情绪映射。
// 生成时机 = 07:01 简报 cron 发布后(一次 LLM,写 KV);链页服务端**只读缓存**,
// 零 LLM、零 fetch,保 ISR/TTFB(与 sentimentSnapshot 同一约定)。缓存缺失时页面用
// fallbackChainTake 规则文案兜底,绝不在渲染路径打模型。
// KV 复用 morning_brief_cache 表,key = chaintake:{date}:{chainId}
// (含 ":{date}:" 中段,/api/admin/brief-cache 排障端点可一并看到)。
import { chatTimed } from "@/lib/llm";
import { getLLMFor } from "@/lib/llm-provider";
import { getPrisma } from "@/lib/prisma";
import { scanBannedWords, hasSpecificMove } from "@/lib/content-guard";
import { STOCK_MAP } from "@/data/stocks";
import type { BriefingItem } from "@/lib/briefings";

const TAKE_PROMPT = `你是 StockTell 的产业链解读助手,面向看不懂产业链的 A 股散户。
给你今天「AI 产业链」相关的简报条目(盘前生成,触发事件=隔夜美股,A 股当天还没开盘),写一段 60~110 字的链级判断:
- 结构:①这条链今天整体偏强/偏弱/分化,压力或动力来自哪些隔夜事件(点名触发,不带具体涨跌数字) ②传导最直接的 1~3 个环节(如 光模块、半导体设备、AI服务器、存储/HBM) ③点明哪些环节或方向更多是情绪映射、不代表订单变化(如 国产算力芯片对海外事件多为情绪映射)。
- 帮用户理解传导,不替用户操作:禁止 买入/卖出/加仓/减仓/抄底/追高/接盘/逢回调布局/上车 等任何操作暗示;用"传导/映射/承压/观察/验证/共振"这类词;不出现 低开/高开/企稳/放量/缩量/破位/补跌 等盘口词。
- A 股尚未开盘,一律前瞻口吻("可能/预计承压/开盘后看"),不断言 A 股已经怎么走;不用"暴跌/崩盘/血洗"等吓人词;不写免责声明。
- 一段话不分点、不用 markdown、不带称呼。只输出正文。`;

// 缓存 key(版本号 t1;文案口径变更时递增作废旧缓存)
const keyOf = (chainId: string, date: string) => `chaintake:${date}:${chainId}:t1`;

// 规则兜底:点名触发 + 受影响最集中的板块。缓存缺失时页面直接用,永不打 LLM。
export function fallbackChainTake(items: BriefingItem[]): string | null {
  if (items.length === 0) return null;
  const triggers = Array.from(
    new Set(items.map((it) => it.triggerName).filter(Boolean))
  ).slice(0, 3) as string[];
  const ups = items.filter((it) => (it.triggerChange ?? 0) > 0).length;
  const downs = items.filter((it) => (it.triggerChange ?? 0) < 0).length;
  // 方向数据缺失(up=down=0)时不妄断强弱,用中性词——别把"没数据"说成"偏强"
  const tone =
    ups > 0 && downs === 0
      ? "偏强"
      : downs > 0 && ups === 0
      ? "偏弱"
      : ups === 0 && downs === 0
      ? "有新动态"
      : "分化";
  const sectorCount = new Map<string, number>();
  for (const it of items)
    for (const b of it.beneficiaries) {
      const sec = STOCK_MAP[b.code]?.sector;
      if (sec) sectorCount.set(sec, (sectorCount.get(sec) ?? 0) + 1);
    }
  const topSectors = Array.from(sectorCount.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([s]) => s);
  const head = tone === "有新动态" ? "今天 AI 链有新动态" : `今天 AI 链情绪${tone}`;
  return `${head},主要来自隔夜 ${triggers.join("、")} 的变动;映射最集中的环节是${topSectors.join("、")}。个股是否只是情绪跟随,要看订单与板块共振验证。`;
}

// LLM 生成(纯生成,无缓存)。失败/为空返回 null,让调用方不缓存、下次重试。
export async function buildChainTake(
  items: BriefingItem[]
): Promise<string | null> {
  if (items.length === 0) return null;
  const llm = await getLLMFor("fast");
  if (!llm) return null;
  const payload = items.map((it) => ({
    impact: it.impact,
    title: it.title,
    trigger: it.triggerName,
    direction: (it.triggerChange ?? 0) >= 0 ? "隔夜涨" : "隔夜跌",
    beneficiaries: it.beneficiaries.map((b) => ({
      name: b.name,
      sector: STOCK_MAP[b.code]?.sector ?? null,
    })),
  }));
  try {
    const resp = await chatTimed("chain-take", llm.provider, () =>
      llm.client.chat.completions.create(
        {
          model: llm.model,
          max_tokens: 400,
          messages: [
            { role: "system", content: TAKE_PROMPT },
            {
              role: "user",
              content: `今天 AI 产业链相关的简报条目(JSON):\n${JSON.stringify(payload, null, 2)}\n\n请写这段链级判断。`,
            },
          ],
        },
        { maxRetries: 1, timeout: 10000 }
      )
    );
    const txt = resp.choices[0]?.message?.content?.trim();
    if (!txt || txt.length === 0) return null;
    // 合规代码级强制(铁律③):链级判断展示在首页/链页,含盘面禁词 / 具体涨跌数字
    // → 判非合规,返回 null → 调用方走 fallbackChainTake 规则兜底,不缓存违规内容。
    if (scanBannedWords(txt).length > 0 || hasSpecificMove(txt)) return null;
    return txt;
  } catch {
    return null;
  }
}

// 只读缓存(链页渲染路径用):有就返回,没有返回 null,不生成。
export async function getChainTake(
  chainId: string,
  date: string
): Promise<string | null> {
  const db = getPrisma();
  if (!db) return null;
  try {
    const row = await db.morningBriefCache.findUnique({
      where: { key: keyOf(chainId, date) },
    });
    return row?.brief ?? null;
  } catch {
    return null;
  }
}

// 生成并写缓存(cron / admin 用)。幂等:已有缓存且未 force 时直接返回。
export async function generateChainTake(
  chainId: string,
  date: string,
  items: BriefingItem[],
  opts?: { force?: boolean }
): Promise<{ take: string | null; cached: boolean }> {
  const db = getPrisma();
  if (db && !opts?.force) {
    const existing = await getChainTake(chainId, date);
    if (existing) return { take: existing, cached: true };
  }
  const built = await buildChainTake(items);
  if (built == null) return { take: null, cached: false }; // 失败不缓存,下次重试
  if (db) {
    try {
      await db.morningBriefCache.upsert({
        where: { key: keyOf(chainId, date) },
        create: { key: keyOf(chainId, date), brief: built },
        update: { brief: built, updatedAt: new Date() },
      });
    } catch {
      /* 写缓存失败不致命 */
    }
  }
  return { take: built, cached: false };
}
