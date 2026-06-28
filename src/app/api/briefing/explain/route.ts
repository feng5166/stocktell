import { NextRequest } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { getPrisma } from "@/lib/prisma";
import { getLLM, LLM_MODEL } from "@/lib/llm";
import { fetchQuotes } from "@/lib/quotes";
import { isAdminAuthorized } from "@/lib/api-guard";
import { isAdminSession } from "@/lib/admin";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const STREAM_HEADERS = {
  "Content-Type": "text/plain; charset=utf-8",
  "Cache-Control": "no-store",
  "X-Accel-Buffering": "no",
};

const SYS = `你是一个天天盯盘、特别会说人话的"老股民搭子",给看不懂产业链的散户做"这条消息到底该怎么想"的完整解读。
合规铁律(违反即失败):不出现"买入/卖出/抄底/加仓/清仓/满仓"等任何操作指令;可点透机会与风险,但绝不下买卖结论;不写免责声明。
按下面几点自然分段(可用简短小标题),说人话、别堆术语、别复述涨跌幅凑字数:
1)这事到底发生了啥:那只美股为什么动(财报/指引/板块情绪等),一句话讲清。
2)跟你的A股票什么关系:传导逻辑、相关度高不高(海外营收占比/业务环节),别硬扯映射。
3)现在A股什么状态:结合给到的实际涨跌判断——跟涨到位/没跟(预期差)/跌过头(超跌)/逆势,讲清是机会还是陷阱,方向必须对。
4)散户最容易踩的坑:针对这条具体说(如"看美股才跌一点就当错杀冲进去")。
5)该盯什么信号:具体可观察(放量、缩量企稳、低开走势、龙头脸色等),不是空话。

排版要求:
- 小标题用 Markdown 加粗(如 **一、到底发生了啥**),关键结论/术语也用 **加粗** 突出。
- 不要用 --- 或 *** 之类的分隔线,直接用空行分段即可。
- 必须完整收尾(把话说完),别写到一半被截断。
像朋友盯盘聊天,有观点、不啰嗦,400-600 字。`;

export async function POST(req: NextRequest) {
  // 管理员清空解读缓存(改了提示词/模型后让存量重生成):?clear=1
  if (req.nextUrl.searchParams.get("clear") === "1") {
    if (!isAdminAuthorized(req) && !(await isAdminSession())) {
      return new Response("unauthorized", { status: 401 });
    }
    const db0 = getPrisma();
    if (db0) await db0.deepAnalysisCache.deleteMany({});
    return new Response("cleared", { status: 200 });
  }

  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return new Response("登录后才能用详细解读哦。", { status: 401 });

  const { id } = await req.json().catch(() => ({ id: "" }));
  if (!id) return new Response("missing id", { status: 400 });

  const db = getPrisma();
  if (!db) return new Response("no database", { status: 500 });
  const item = await db.briefingItem.findUnique({ where: { id } });
  if (!item) return new Response("not found", { status: 404 });

  const encoder = new TextEncoder();

  // 缓存命中:直接回放(同一条解读不重复打 LLM)
  const cached = await db.deepAnalysisCache
    .findUnique({ where: { briefingId: id } })
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

  // 取实时行情补充真实数字(周末=最近收盘)
  const benes = (item.beneficiaries as unknown as { code: string; name: string }[]) || [];
  const codes = [item.triggerCode, ...benes.map((b) => b.code)].filter(Boolean) as string[];
  const { quotes } = await fetchQuotes(codes);
  const pct = (c?: string | null) => {
    const ch = c ? quotes[c]?.change : undefined;
    return ch != null ? `${ch > 0 ? "+" : ""}${ch}%` : "未开盘/无数据";
  };
  const peerLines = benes.map((b) => `- ${b.name}(${b.code}):${pct(b.code)}`).join("\n");
  const userMsg = `简报标题:${item.title}
触发美股:${item.triggerName ?? item.triggerCode}${item.triggerChange != null ? `(${item.triggerChange}%)` : ""}
对应 A 股(及最新涨跌):
${peerLines || "(无)"}
一句话快读:${item.retailTake}

请给这条出一份"散户角度的完整解读"。`;

  const llmStream = await client.chat.completions.create({
    model: LLM_MODEL,
    stream: true,
    max_tokens: 8000, // 推理模型会先吃一大段思考 token,留足空间避免正式解读被截断
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
            where: { briefingId: id },
            create: { briefingId: id, content: full },
            update: { content: full },
          })
          .catch(() => {});
      }
    },
  });
  return new Response(rs, { headers: STREAM_HEADERS });
}
