import { NextRequest } from "next/server";
import { withMetrics } from "@/lib/metrics";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { getPrisma } from "@/lib/prisma";
import { getLLMFor } from "@/lib/llm-provider";
import { fetchQuotes } from "@/lib/quotes";
import crypto from "crypto";
import { STOCK_MAP, resolvePeer } from "@/data/stocks";
import { buildWatchChainMap } from "@/lib/watch-relation";
import { resolveMorningItems } from "@/lib/morning-brief";
import { fundFlowFor } from "@/lib/fund-flow";
import { todayISO } from "@/lib/date";
import { isAdminAuthorized } from "@/lib/api-guard";
import { isAdminSession } from "@/lib/admin";
import { rateLimit, clientIp } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

const STREAM_HEADERS = {
  "Content-Type": "text/plain; charset=utf-8",
  "Cache-Control": "no-store",
  "X-Accel-Buffering": "no",
};

// 针对"某条简报/某只票"的散户角度完整解读。两种入参:简报条目(id)或个股(code)。
const SYS = `你是一个天天盯盘、特别会说人话的"老股民搭子",给看不懂产业链的散户做"到底该怎么想"的完整解读。
合规铁律(违反即失败):不出现"买入/卖出/抄底/加仓/清仓/满仓"等任何操作指令;可点透机会与风险,但绝不下买卖结论;不写免责声明。
自然分段(可用 Markdown 小标题),说人话、别堆术语、别复述涨跌幅凑字数:
- 这事/这只票到底是怎么回事(主业、在产业链什么位置、靠什么驱动)。
- 跟谁联动:海外哪只、A股哪些是风向标,相关度高不高(别硬扯映射)。
- 现在怎么看:结合实际涨跌与板块情绪判断——强还是弱、题材还是业绩、跟涨到位/没跟(联动落差)/跌过头(超跌)/逆势,方向必须对,讲清是机会还是陷阱。
- 散户最容易踩的坑:针对这条/这只票具体说。
- 该盯什么信号:具体可观察(订单/出货量数据、招标与财报节奏、龙头脸色、海外对标等),不是空话。
挑最相关的几点讲透即可,不必每点都写、别凑字数。

排版要求:
- 小标题用 Markdown 加粗(如 **现在怎么看**),关键结论/术语也用 **加粗** 突出。
- 不要用 --- 或 *** 之类的分隔线,直接用空行分段。
- 必须完整收尾(把话说完),别写到一半被截断。
像朋友盯盘聊天,有观点、不啰嗦、别注水,**250-350 字内说透(硬要求,别超)**。`;

const pctStr = (ch?: number) =>
  ch != null ? `${ch > 0 ? "+" : ""}${ch}%` : "未开盘/无数据";

export const POST = withMetrics("briefing-explain", _POST);
async function _POST(req: NextRequest) {
  // 管理员清空解读缓存:?clear=1
  if (req.nextUrl.searchParams.get("clear") === "1") {
    if (!isAdminAuthorized(req) && !(await isAdminSession())) {
      return new Response("unauthorized", { status: 401 });
    }
    const db0 = getPrisma();
    if (db0) await db0.deepAnalysisCache.deleteMany({});
    return new Response("cleared", { status: 200 });
  }

  const session = await getServerSession(authOptions);
  const userId = session?.user?.id;

  // JSON 字面量 null 也是合法 JSON(catch 不接管),直接取属性会 500
  const rawBody = await req.json().catch(() => ({}));
  const body = (rawBody && typeof rawBody === "object" ? rawBody : {}) as Record<
    string,
    unknown
  >;
  const id = typeof body.id === "string" ? body.id : undefined;
  const code = typeof body.code === "string" ? body.code : undefined;
  const kind = typeof body.kind === "string" ? body.kind : undefined;

  // 免登录口径(新手路径 v2,2026-08-01):id/code 解读对游客开放——内容全部服务端解析、
  // 缓存按 条目/票×日 跨用户共享,游客无投毒面;kind=morning/fundflow 依赖库内自选,仍需登录。
  if (!userId && !(id || code)) {
    return new Response("登录后才能看「和我相关」的整体解读哦。", { status: 401 });
  }

  const db = getPrisma();
  if (!db) return new Response("no database", { status: 500 });

  // 组装:缓存键 + 用户消息(简报 or 个股)
  let cacheKey = "";
  let userMsg = "";

  if (id) {
    const item = await db.briefingItem.findUnique({ where: { id } });
    if (!item) return new Response("not found", { status: 404 });
    cacheKey = id;
    const benes = (item.beneficiaries as unknown as { code: string; name: string }[]) || [];
    const codes = [item.triggerCode, ...benes.map((b) => b.code)].filter(Boolean) as string[];
    const { quotes } = await fetchQuotes(codes);
    const peerLines = benes
      .map((b) => `- ${b.name}(${b.code}):${pctStr(quotes[b.code]?.change)}`)
      .join("\n");
    userMsg = `简报标题:${item.title}
触发美股:${item.triggerName ?? item.triggerCode}${item.triggerChange != null ? `(${item.triggerChange}%)` : ""}
对应 A 股(及最新涨跌):
${peerLines || "(无)"}
一句话快读:${item.retailTake}

请给这条出一份"散户角度的完整解读"。`;
  } else if (code && kind === "map") {
    // 「第一份传导地图」LLM 版(新手路径 v2 P1):对一只票输出 上游→环节→这只票 的
    // 逐跳人话地图。上下文全部服务端装配(关系档/环节/验证点为人工核定静态数据),
    // 缓存按 票×日 跨用户共享,游客可看。
    if (!Object.prototype.hasOwnProperty.call(STOCK_MAP, code))
      return new Response("not found", { status: 404 });
    const s = STOCK_MAP[code];
    cacheKey = `map:${code}:${todayISO()}`;
    const chainInfo = buildWatchChainMap()[code];
    const anchors = (s.relations || [])
      .map((t) => resolvePeer(t))
      .filter((p): p is NonNullable<typeof p> => Boolean(p) && p!.market === "美股")
      .slice(0, 3);
    const { quotes } = await fetchQuotes([s.code, ...anchors.map((a) => a.code)]);
    const anchorLines = anchors
      .map((a) => `- ${a.name}(${a.code}):${pctStr(quotes[a.code]?.change)};定位:${a.positioning}`)
      .join("\n");
    userMsg = `给散户画一份「${s.name} 的传导地图」。已核定的静态关系(不许编造之外的关系):
个股:${s.name}(${s.code})· 板块 ${s.sector} · 产业链位置 ${s.position}
定位:${s.positioning}
${chainInfo ? `所在链:${chainInfo.chainName} · 环节:${chainInfo.segment} · 关系档:${chainInfo.relation}${chainInfo.reason ? ` · 核定说明:${chainInfo.reason}` : ""}\n验证点:${chainInfo.verify.join("、") || "(无)"}` : "所在链:暂无核定链上关系(只讲它自己的定位与联动)"}
上游美股锚点(及最新涨跌):
${anchorLines || "(无)"}
当前行情:${pctStr(quotes[s.code]?.change)}

要求:按「上游发生什么 → 中间传导环节 → 传到这只票」的顺序,每一跳一小段人话讲清
"为什么会传、传导强弱、这一跳最容易断在哪";最后给"本周盯什么信号"(用上面的验证点,
具体可观察)。关系档是 ${chainInfo?.relation ?? "未核定"},分寸感要匹配——情绪映射就明说
"更多是情绪带动"。不许下买卖结论。`;
  } else if (code) {
    // hasOwnProperty:挡 "constructor" 等原型链属性名混进缓存 key/LLM 输入
    if (!Object.prototype.hasOwnProperty.call(STOCK_MAP, code))
      return new Response("not found", { status: 404 });
    const s = STOCK_MAP[code];
    cacheKey = `stock:${code}:${todayISO()}`;
    const related = (s.relations || [])
      .map((t) => resolvePeer(t))
      .filter((p): p is NonNullable<typeof p> => Boolean(p))
      .slice(0, 5);
    const relCodes = [s.code, ...related.map((p) => p.code)];
    const { quotes } = await fetchQuotes(relCodes);
    const relLines = related
      .map((p) => `- ${p.name}(${p.code},${p.market}):${pctStr(quotes[p.code]?.change)}`)
      .join("\n");
    userMsg = `个股:${s.name}(${s.code})· ${s.market} · 板块 ${s.sector} · 产业链位置 ${s.position}
当前行情:${pctStr(quotes[s.code]?.change)}
长期定位:${s.observation || s.retailTake || ""}
相关联动标的(及最新涨跌):
${relLines || "(无)"}

今天它没有专门的简报事件,请给这只票出一份"现在散户该怎么看"的完整解读。`;
  } else if (kind === "morning") {
    // 今日早报深读:对"我的自选相关动态"做整体解读(不逐条复述)。
    // 条目一律服务端解析(登录用户自选 → 相关简报),不信客户端传的 items:
    // 缓存按 codes 组合跨用户共享,客户端可控的 items 会让编造内容进共享缓存;
    // 且缓存 key 用条目所属日期而非"今天"——凌晨回退展示昨日简报时,深读基于昨日条目,
    // 若按今天缓存,07:01 换新后同 codes 组合会全天命中昨日叙事(与早报 v4 修复同因)。
    if (!userId) return new Response("登录后才能看整体解读哦。", { status: 401 });
    const ws = await db.watchlist.findMany({
      where: { userId },
      select: { code: true },
    });
    // date hint 同早报卡:让深读和用户正读的那期一致(校验+确有该期才生效)
    const hint = typeof body.date === "string" ? body.date : undefined;
    const { date: issueDate, items } = await resolveMorningItems(
      ws.map((w) => w.code),
      hint
    );
    if (items.length === 0)
      return new Response("你的自选这一期没有相关动态,暂时没有可深读的内容。", {
        status: 404,
      });
    const codeSet = new Set<string>();
    for (const it of items) {
      if (it.triggerCode) codeSet.add(it.triggerCode);
      for (const b of it.beneficiaries ?? []) if (b?.code) codeSet.add(b.code);
    }
    const codes = Array.from(codeSet).sort();
    // key 带条目 id:同一组 codes 可能由不同条目子集凑出(内容不同,不能共享缓存)。
    // 前缀 morningv2:此前 items 可由客户端伪造,老 morning: 行可能已被污染,升版整体作废
    // (老行由看门狗 TTL 清理;读路径从此不碰)。
    const idSig = items.map((it) => it.id).sort().join(",");
    const mHash = crypto
      .createHash("sha256")
      .update(`${idSig}|${codes.join(",")}`)
      .digest("hex")
      .slice(0, 24);
    cacheKey = `morningv2:${issueDate}:${mHash}`;
    // 熔断:同一期深读生成封顶(登录用户改自选也能磨新 key,每次都是 2000 token 的流式生成)。
    // 503(非 404):前端 DeepRead 对 503 走"服务繁忙+重试",对 404 是终态。
    const mCount = await db.deepAnalysisCache
      .count({ where: { briefingId: { startsWith: `morningv2:${issueDate}:` } } })
      .catch(() => 0);
    if (mCount >= 150) return new Response("深读今天有点忙,稍后再试。", { status: 503 });
    const { quotes } = await fetchQuotes(codes);
    const lines = items
      .map((it) => {
        const benes = it.beneficiaries ?? [];
        const bl = benes
          .map((b) => `${b.name}(${pctStr(quotes[b.code]?.change)})`)
          .join("、");
        const trig = it.triggerName
          ? ` [触发:${it.triggerName}${it.triggerChange != null ? ` ${it.triggerChange}%` : ""}]`
          : "";
        return `- ${it.title ?? ""}${trig}${bl ? ` → 关联A股:${bl}` : ""}${it.retailTake ? `;快读:${it.retailTake}` : ""}`;
      })
      .join("\n");
    userMsg = `这是今天和"我的自选"相关的全部动态汇总(含最新涨跌):
${lines}

请给我一份"今天我这些自选整体该怎么看"的完整解读:哪几条最值得关注、彼此有没有联动/共振、是题材还是业绩驱动、有没有联动落差(没跟上)或超跌、今天盯盘该重点看哪些信号。要有重点和取舍,别逐条复述。`;
  } else if (kind === "fundflow") {
    // 资金面深读:对"我的自选"A股主力/融资/龙虎榜做整体解读。
    // 数据一律服务端取真(登录用户自选 → fundFlowFor),不信客户端传的 items:
    // 解读缓存按(日期+codes)跨用户共享,客户端可控的数字意味着任何登录用户都能让
    // "主力净流入+99亿"这类编造结论进共享缓存(与早报投毒同因);codes 也不再可自由组合刷 key。
    if (!userId) return new Response("登录后才能看整体解读哦。", { status: 401 });
    const ws = await db.watchlist.findMany({
      where: { userId },
      select: { code: true },
    });
    const ff = await fundFlowFor(ws.map((w) => w.code));
    // 503(非 404):瞬时源失败要给前端"重试"语义——DeepRead 对 404 是终态没有重试按钮
    if (ff.complete === false)
      return new Response("资金面数据源暂不完整,稍后再试。", { status: 503 });
    const fitems = ff.items.filter(
      (x) => x.netMf !== null || x.longhu || x.rzChgYi !== null
    );
    if (fitems.length === 0)
      return new Response("你的自选暂无显著资金面数据,数据出来后再来看。", {
        status: 404,
      });
    const date = ff.date ?? todayISO();
    const codes = fitems.map((it) => it.code).sort();
    // 前缀 fundflowv2:老 fundflow: 行可能已被客户端编造数据污染,升版作废(TTL 清理)
    cacheKey = `fundflowv2:${date}:${codes.join(",")}`;
    const lines = fitems
      .map((it) => {
        const parts: string[] = [];
        if (it.netMf != null)
          parts.push(`主力净流入 ${it.netMf > 0 ? "+" : ""}${it.netMf}亿`);
        if (it.rzChgYi != null)
          parts.push(`融资余额变化 ${it.rzChgYi > 0 ? "+" : ""}${it.rzChgYi}亿`);
        if (it.longhu)
          parts.push(
            `登龙虎榜(净${it.longhu.net > 0 ? "+" : ""}${it.longhu.net}亿,${it.longhu.reason})`
          );
        return `- ${it.name ?? it.code}:${parts.join(",") || "无显著资金数据"}`;
      })
      .join("\n");
    userMsg = `这是"我的自选"A股最近一个交易日(${date})的资金面数据:
${lines}

请从资金面角度给一份完整解读:这些"聪明钱"动向整体说明什么、是流入还是流出主导、主力与融资盘是否方向一致、龙虎榜是游资还是机构味道、哪些可能是陷阱(比如对倒做量、借利好派发)、散户看资金面最容易误读什么。讲人话、有判断。`;
  } else {
    return new Response("missing id or code", { status: 400 });
  }

  const encoder = new TextEncoder();

  // 缓存命中:直接回放
  const cached = await db.deepAnalysisCache
    .findUnique({ where: { briefingId: cacheKey } })
    .catch(() => null);
  if (cached?.content) {
    return new Response(
      new ReadableStream({
        start(c) {
          c.enqueue(encoder.encode(cached.content));
          c.close();
        },
      }),
      { headers: STREAM_HEADERS }
    );
  }

  // 游客生成闸(缓存命中不受限,只限真正触发 LLM 的 miss):per-IP 尽力而为,
  // 键空间本身有界(条目 id / 池内票×日),这里只防单 IP 脚本扫池。
  if (!userId) {
    const rl = rateLimit(`explain-guest:${clientIp(req.headers)}`, 20, 3600_000);
    if (!rl.ok) return new Response("解读今天有点忙,稍后再试。", { status: 503 });
  }

  // 深读走 fast/flash;按后台开关选主(modelverse)或兜底(DeepSeek 官方)。
  const llm = await getLLMFor("fast");
  if (!llm) return new Response("LLM 未配置", { status: 503 });

  // LLM 服务偶发抖动:create() 失败先重试一次,仍失败返回干净 503(前端显示「重试」按钮)。
  const createStream = () =>
    llm.client.chat.completions.create({
      model: llm.model,
      stream: true,
      max_tokens: 2000,
      messages: [
        { role: "system", content: SYS },
        { role: "user", content: userMsg },
      ],
    });
  let llmStream;
  try {
    llmStream = await createStream();
  } catch {
    await new Promise((r) => setTimeout(r, 1200));
    try {
      llmStream = await createStream();
    } catch {
      return new Response("解读暂时不可用,请重试", { status: 503 });
    }
  }

  let full = "";
  const rs = new ReadableStream({
    async start(controller) {
      try {
        for await (const chunk of llmStream) {
          const t = chunk.choices?.[0]?.delta?.content || "";
          if (t) {
            full += t;
            controller.enqueue(encoder.encode(t));
          }
        }
      } catch {
        controller.enqueue(encoder.encode("\n\n[解读生成中断了,稍后再点一次试试]"));
      }
      controller.close();
      if (full.trim()) {
        db.deepAnalysisCache
          .upsert({
            where: { briefingId: cacheKey },
            create: { briefingId: cacheKey, content: full },
            update: { content: full },
          })
          .catch(() => {});
      }
    },
  });
  return new Response(rs, { headers: STREAM_HEADERS });
}
