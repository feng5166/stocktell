// 为什么动:给触发美股补一句"最近一个交易日为什么异动"的真实起因。
// 红线:必须有联网检索能力才做。默认关闭(未设 WHY_ENABLED)→ 返回 null,前端不显示,零幻觉风险。
// 开启前提:配 WHY_ENABLED=1,且 WHY_LLM_MODEL / LLM_* 指向一个"能联网检索"的模型。
// 即便开启,提示词也强制"没把握就 reason=null,绝不编因果"。
import { getLLM, LLM_MODEL } from "@/lib/llm";

export interface WhyResult {
  reason: string | null; // 一句话起因;无可靠信息时为 null
  asOf: string | null; // 依据信息的大致日期 YYYY-MM-DD
}

const EMPTY: WhyResult = { reason: null, asOf: null };

// 进程内缓存,按 code+date,避免同一天重复打模型
const cache = new Map<string, WhyResult>();

const WHY_PROMPT = `你要解释某只美股"最近一个交易日为什么明显异动"。
铁律(违反即失败):
- 只有当你掌握"近几日、可核实的公开事实(官方公告/财报/权威新闻)"时,才给出 reason。
- 一旦不确定、或信息可能过时、或要靠猜测,reason 必须为 null。绝不编造,不写"可能/或因/预计"之类硬凑因果。
- reason 给出时为一句话(≤40字,中文),并在 asOf 写出你依据信息的大致日期(YYYY-MM-DD)。
只输出 JSON:{"reason": string|null, "asOf": string|null},不要任何多余文字。`;

export async function explainMove(
  name: string,
  code: string,
  date: string
): Promise<WhyResult> {
  if (!process.env.WHY_ENABLED) return EMPTY; // 默认关闭:没联网检索就不做
  const key = `${code}:${date}`;
  const cached = cache.get(key);
  if (cached) return cached;

  const client = getLLM();
  if (!client) return EMPTY;
  try {
    const resp = await client.chat.completions.create({
      model: process.env.WHY_LLM_MODEL || LLM_MODEL,
      max_tokens: 300,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: WHY_PROMPT },
        {
          role: "user",
          content: `美股:${name}(${code})。它最近一个交易日为什么异动?`,
        },
      ],
    });
    const txt = resp.choices[0]?.message?.content ?? "{}";
    const p = JSON.parse(txt) as Partial<WhyResult>;
    const out: WhyResult = {
      reason:
        typeof p.reason === "string" && p.reason.trim() ? p.reason.trim() : null,
      asOf: typeof p.asOf === "string" && p.asOf.trim() ? p.asOf.trim() : null,
    };
    cache.set(key, out);
    return out;
  } catch {
    return EMPTY;
  }
}
