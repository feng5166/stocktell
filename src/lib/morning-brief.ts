// 个性化盘前早报:把"用户今天和自选相关的简报条目"综合成一段人话早报。
// 用于邮件(digest)/微信(push-weixin)推送顶部,以及网页「和我相关」顶部。
// 没配 LLM 时降级为规则概览,绝不喊买卖、不出现用户名字。
import crypto from "crypto";
import { chatTimed } from "@/lib/llm";
import { getLLMFor } from "@/lib/llm-provider";
import { getPrisma } from "@/lib/prisma";
import { todayISO } from "@/lib/date";
import { fundFlowFor } from "@/lib/fund-flow";
import { scanBannedWords, hasSpecificMove } from "@/lib/content-guard";
import { listBriefing, latestBriefing, type BriefingItem } from "@/lib/briefings";

function matchByCodes(all: BriefingItem[], codes: string[]): BriefingItem[] {
  const set = new Set(codes);
  return all.filter(
    (b) =>
      (b.triggerCode != null && set.has(b.triggerCode)) ||
      b.beneficiaries.some((x) => set.has(x.code))
  );
}

// 服务端解析「与该自选相关」的简报条目:优先今天已发布,没有则回退最近一期(与首页口径一致)。
// ⚠️ 这是早报的唯一合法数据源——绝不能信客户端传来的 items:早报缓存按(日期+自选组合)全局共享,
// 客户端可控的 items 意味着任何匿名请求都能预写/污染其他用户的早报(内容投毒),
// 也能用垃圾日期字符串刷出无限新 key 白烧 LLM。
// dateHint = 页面正在展示那期的日期:仅当该日确有已发布简报才按它解析,让早报卡与页面
// 讲同一期(07:01 发布/重刷后 ISR 60s 窗口内新旧期并存时,卡片和信息流不打架)。
// 查询失败一律往上抛(失败≠"今天没简报",静默回退会把今天错标成"最近一期")。
export async function resolveMorningItems(
  codes: string[],
  dateHint?: string
): Promise<{
  date: string; // 条目所属日期(回退时=最近一期的日期)
  stale: boolean; // true=这期不是今天的(回退/hint 到历史期)
  items: BriefingItem[]; // 与 codes 相关的条目(可能为空)
}> {
  const today = todayISO();
  // hint 只认「最近一期」:UI 合法展示的只有今天或最近一期,放开任意历史期会给匿名方
  // 一个乘法器(熔断预算×历史期数,且 TTL 清扫会重置各期计数)。hint=今天等价默认路径。
  if (dateHint && dateHint !== today && /^\d{4}-\d{2}-\d{2}$/.test(dateHint)) {
    const latest = await latestBriefing();
    if (latest?.date === dateHint && latest.items.length > 0)
      return {
        date: dateHint,
        stale: true,
        items: matchByCodes(latest.items, codes),
      };
    // hint 不是最近一期(含伪造/过老日期):忽略,走默认解析
  }
  let all = await listBriefing({ date: today, status: "published" });
  let issueDate = today;
  if (all.length === 0) {
    const latest = await latestBriefing();
    if (latest?.date && latest.items.length > 0) {
      all = latest.items;
      issueDate = latest.date;
    }
  }
  // stale 按「这期是不是今天的」判定,而非「是否走了回退」——两者在异常路径下会背离
  return {
    date: issueDate,
    stale: issueDate !== today,
    items: matchByCodes(all, codes),
  };
}

const BRIEF_PROMPT = `你是 StockTell 的盘前早报助手,面向看不懂产业链的散户。你的角色是"懂行、靠谱、会说人话的盯盘搭子",帮用户稳住情绪,而不是制造焦虑。
我会给你某用户今天「和他自选相关」的简报条目,你写一段个性化早报:
- 口语、像朋友顺手提醒,直接说事,不要出现任何称呼或人名。
- 先一句整体概览(今天你的票整体什么情况/偏强偏弱),再点出最该注意的 1-2 只或 1-2 件事。
- 只讲传导逻辑与风险提示,绝不喊买卖、不给操作建议(不出现"买入/卖出/加仓/抄底"等)。
- 语气陪伴、平稳,不渲染恐慌:禁用"暴跌/崩盘/血洗/重挫/恐慌性抛售/利空出尽"等情绪化吓人词,改用中性词(回调/走弱/承压/分化/修复)。
- 行情不好时也帮用户冷静看待(如提示"先分清是情绪传导还是基本面变化"),但不打包票、不安慰式承诺。
- 不给盘面操作提示:不出现 低开/高开/企稳/放量/缩量/破位/补跌/接/冲/追/低吸/超跌反弹 等盘口词;观察点一律用 订单/客户/财报/毛利率/公告/板块共振。
- 若提供了资金面数据,自然融入 1 句(如主力大幅净流出、融资明显加仓、上了龙虎榜),中性措辞,别堆数字、别下结论。
- 不用倾向性归类词:禁"积极相关/利好相关/正面相关"(读起来像投资倾向)——中性表述为"和你的票相关的传导/今日触发的关系"。
- 自然收尾,口径中性;**务必把话说完整、自然结尾,不要写一半**;140~220 字,3-5 句。
只输出早报正文,不要 JSON、不要 markdown、不要逐条列表符号。`;

function fallback(items: BriefingItem[]): string {
  const list = items.map((it) => it.title).join(";");
  // 措辞不说"今天":items 可能是回退/最近一期,卡片标题按 stale 写"最近一期"时,
  // 正文再自称"今天"就是同卡两种日期口径(标题正文绑定同期的修复不能在兜底路径漏网)
  return `这一期你的自选有 ${items.length} 条相关动态:${list}。(以上为信息整理,不构成投资建议)`;
}

// 纯生成(无缓存)。调用方一般用 getMorningBrief 走每日缓存。
// 返回 LLM 早报正文;LLM 失败/为空返回 null(让调用方走"不缓存的模板回退",下次重试)。
export async function buildMorningBrief(
  codes: string[],
  items: BriefingItem[]
): Promise<string | null> {
  if (items.length === 0) return fallback(items);
  const llm = await getLLMFor("fast");
  // 没配 LLM → null:让调用方走"不缓存的模板回退"。若在这里直接返回模板文本,
  // getMorningBrief 会把降级模板当正文永久缓存,key 恢复后也不自愈(v3 升版就是修这个)。
  if (!llm) return null;

  const payload = items.map((it) => ({
    impact: it.impact,
    title: it.title,
    beneficiaries: (it.beneficiaries ?? []).map((b) => b.name),
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
    const resp = await chatTimed("morning-brief", llm.provider, () =>
      llm.client.chat.completions.create(
      {
        // 早报是短文本,用 fast/flash:快、且不会被 reasoning 吃掉 token 截断正文。
        model: llm.model,
        max_tokens: 700,
        messages: [
          { role: "system", content: BRIEF_PROMPT },
          { role: "user", content: userContent },
        ],
      },
      // SDK 默认重试 2 次会叠成 30s 拖超时;这里只重试 1 次 + 每次 10s 硬超时
      // (最坏约 22s,函数 maxDuration 30s 内),既能扛住单次抖动、又不卡死。
      { maxRetries: 1, timeout: 10000 }
    ));
    const txt = resp.choices[0]?.message?.content?.trim();
    if (!txt || txt.length === 0) return null; // 空 → null,不缓存,下次重试
    // 合规代码级强制(铁律③):早报是每天自动发给用户的内容,含盘面禁词 / 具体涨跌数字
    // → 判非合规,当生成失败处理(返回 null → 调用方走模板兜底,不缓存违规内容)。
    if (scanBannedWords(txt).length > 0 || hasSpecificMove(txt)) return null;
    return txt;
  } catch {
    return null; // LLM 失败 → null,不缓存,下次重试
  }
}

// 带每日缓存:key = 条目所属日期 + (条目id+相关自选) hash。
// 同一期、同一组相关内容只真正生成一次(走 DB 全局缓存 morning_brief_cache),不重复打大模型。
// ⚠️ key 必须用「条目自己的 date」而非 todayISO():00:00~07:00 首页回退展示昨日简报,
// 若按"今天"缓存,会把昨日内容钉死成今天的早报,07:01 邮件也命中同一条错缓存
// (2026-07-03 事故:Meta 昨涨今跌,早报一整天说"Meta大涨是利好")。
// 凌晨用昨日条目算出的 key = 昨日 key,通常直接命中昨天已生成的缓存,零成本且与页面
// "以下为最近一期"的回退展示一致;今天简报发布后条目换新,key 随之切到今天。
export async function getMorningBrief(
  codes: string[],
  items: BriefingItem[],
  opts?: { trusted?: boolean } // trusted=服务端定时/推送路径:不受熔断限制(熔断只防匿名刷组合)
): Promise<string> {
  const today = todayISO();
  const itemsDate = items[0]?.date;
  // 兜底校验:date 只接受严格 YYYY-MM-DD 且 ≤ 今天,否则按今天。正常调用方(本文件的
  // resolveMorningItems / digest)给的都是服务端日期,这里防的是任何残留的不可信入口
  // 把垃圾字符串写进 key(每个垃圾值=一个永不复用的新 key=一次白烧的 LLM)。
  const okFmt =
    typeof itemsDate === "string" && /^\d{4}-\d{2}-\d{2}$/.test(itemsDate);
  const date = okFmt && itemsDate <= today ? itemsDate : today;
  // key 归一化:只由「条目 id + 与条目相关的自选」构成——与今天叙事无关的自选码既不改变
  // 早报内容,也不该改变 key(否则匿名方拿 1 个命中码 × 任意池内码组合就能刷出无限新 key,
  // 每个都白烧一次 LLM)。资金面同样只讲相关票:其余持仓的资金/雷区提醒由 digest 的
  // watch alerts 单独负责,这里不重复。条目 id 也进 key:同一组 codes 命中不同条目子集时
  // 内容不同,不能共享缓存。
  const itemCodes = new Set<string>();
  for (const it of items) {
    if (it.triggerCode) itemCodes.add(it.triggerCode);
    for (const b of it.beneficiaries ?? []) itemCodes.add(b.code);
  }
  const relevant = Array.from(new Set(codes))
    .filter((c) => itemCodes.has(c))
    .sort();
  const ids = items
    .map((it) => it.id)
    .slice()
    .sort()
    .join(",");
  const sig = `${ids}|${relevant.join(",")}`;
  const hash = crypto.createHash("sha256").update(sig).digest("hex").slice(0, 24);
  const key = `v5:${date}:${hash}`; // v5:key 归一化(条目id+相关自选),作废 v4 及此前可被预写的旧行

  const db = getPrisma();
  if (db) {
    try {
      const row = await db.morningBriefCache.findUnique({ where: { key } });
      if (row) return row.brief; // 当天已生成 → 直接返回,不打模型
    } catch {
      /* 读缓存失败不致命,继续实时生成 */
    }
    // 熔断:同一期生成条数封顶(只拦不可信入口;digest/微信等服务端路径带 trusted 直通,
    // 匿名刷组合刷满预算时真实用户的邮件不受影响)。正常一天 = 用户数 × 1~2 个组合,远够;
    // 被恶意刷时最多烧到上限就全部走模板兜底(不缓存)。注意这是软顶:先查数后生成,
    // 并发窗口内可能少量超发,作为花费保险丝足够,不为它上原子计数器。
    if (!opts?.trusted) {
      try {
        const n = await db.morningBriefCache.count({
          where: { key: { startsWith: `v5:${date}:` } },
        });
        if (n >= 300) return fallback(items);
      } catch {
        /* 计数失败不拦生成 */
      }
    }
  }

  const built = await buildMorningBrief(relevant, items);

  // LLM 没出来(null):返回模板兜底,但不缓存——下次请求自动重试 LLM,自愈成完整早报。
  if (built == null) return fallback(items);

  if (db) {
    try {
      await db.morningBriefCache.upsert({
        where: { key },
        create: { key, brief: built },
        update: { brief: built, updatedAt: new Date() },
      });
    } catch {
      /* 写缓存失败不致命 */
    }
  }
  return built;
}
