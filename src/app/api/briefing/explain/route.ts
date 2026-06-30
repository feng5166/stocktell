import { NextRequest } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { getPrisma } from "@/lib/prisma";
import { getLLM, LLM_MODEL_FAST } from "@/lib/llm";
import { fetchQuotes } from "@/lib/quotes";
import { STOCK_MAP, resolvePeer } from "@/data/stocks";
import { todayISO } from "@/lib/date";
import { isAdminAuthorized } from "@/lib/api-guard";
import { isAdminSession } from "@/lib/admin";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

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
- 该盯什么信号:具体可观察(放量、缩量企稳、低开走势、龙头脸色、海外对标等),不是空话。

排版要求:
- 小标题用 Markdown 加粗(如 **现在怎么看**),关键结论/术语也用 **加粗** 突出。
- 不要用 --- 或 *** 之类的分隔线,直接用空行分段。
- 必须完整收尾(把话说完),别写到一半被截断。
像朋友盯盘聊天,有观点、不啰嗦,400-600 字。`;

const pctStr = (ch?: number) =>
  ch != null ? `${ch > 0 ? "+" : ""}${ch}%` : "未开盘/无数据";

export async function POST(req: NextRequest) {
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
  if (!session?.user?.id) return new Response("登录后才能看「StockTell 解读」哦。", { status: 401 });

  const body = await req.json().catch(() => ({}));
  const id: string | undefined = body.id;
  const code: string | undefined = body.code;
  const kind: string | undefined = body.kind;

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
  } else if (code) {
    const s = STOCK_MAP[code];
    if (!s) return new Response("not found", { status: 404 });
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
    // 今日早报深读:对"我的自选相关动态"做整体解读(不逐条复述)
    type Bene = { code: string; name: string };
    type MItem = {
      title?: string;
      triggerName?: string;
      triggerCode?: string;
      triggerChange?: number;
      retailTake?: string;
      beneficiaries?: Bene[];
    };
    const items: MItem[] = Array.isArray(body.items) ? body.items : [];
    if (items.length === 0) return new Response("missing items", { status: 400 });
    const codeSet = new Set<string>();
    for (const it of items) {
      if (it.triggerCode) codeSet.add(it.triggerCode);
      for (const b of it.beneficiaries ?? []) if (b?.code) codeSet.add(b.code);
    }
    const codes = Array.from(codeSet).sort();
    cacheKey = `morning:${todayISO()}:${codes.join(",")}`;
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
    // 资金面深读:对"我的自选"A股主力/融资/龙虎榜做整体解读
    type FItem = {
      code: string;
      name?: string;
      netMf?: number | null;
      rzChgYi?: number | null;
      longhu?: { net: number; reason: string } | null;
    };
    const items: FItem[] = Array.isArray(body.items) ? body.items : [];
    if (items.length === 0) return new Response("missing items", { status: 400 });
    const date =
      typeof body.date === "string" && body.date ? body.date : todayISO();
    const codes = items.map((it) => it.code).filter(Boolean).sort();
    cacheKey = `fundflow:${date}:${codes.join(",")}`;
    const lines = items
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

请从资金面角度给一份完整解读:这些"聪明钱"动向整体说明什么、是流入还是流出主导、主力与融资盘是否方向一致、龙虎榜是游资还是机构味道、哪些可能是陷阱(放量出货/对倒)、散户看资金面最容易误读什么。讲人话、有判断。`;
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

  const client = getLLM();
  if (!client) return new Response("LLM 未配置", { status: 503 });

  // LLM 服务偶发抖动:create() 失败先重试一次,仍失败返回干净 503(前端显示「重试」按钮)。
  const createStream = () =>
    client.chat.completions.create({
      model: LLM_MODEL_FAST,
      stream: true,
      max_tokens: 8000,
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
