import { NextRequest } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { getPrisma } from "@/lib/prisma";
import { getLLM, LLM_MODEL } from "@/lib/llm";
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
- 现在怎么看:结合实际涨跌与板块情绪判断——强还是弱、题材还是业绩、跟涨到位/没跟(预期差)/跌过头(超跌)/逆势,方向必须对,讲清是机会还是陷阱。
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

  const llmStream = await client.chat.completions.create({
    model: LLM_MODEL,
    stream: true,
    max_tokens: 8000,
    messages: [
      { role: "system", content: SYS },
      { role: "user", content: userMsg },
    ],
  });

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
