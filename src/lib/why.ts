// 为什么动:给触发美股补一句"最近一个交易日为什么异动"的真实起因。
// 红线:只在能拿到"可核实材料"时才给 reason,否则 null,前端不显示,零幻觉。
// 两条获取路径(按优先级):
//   1) 博查检索增强(配 BOCHA_API_KEY):先搜真实新闻 → 喂 LLM 只基于材料总结,带来源链接。
//   2) 兼容旧路径(配 WHY_ENABLED 且模型本身能联网):直接问模型,提示词强制没把握就 null。
//   都没有 → 返回 null。
import { getLLM, LLM_MODEL } from "@/lib/llm";
import { bochaSearch, bochaEnabled, type BochaHit } from "@/lib/bocha";

export interface WhyResult {
  reason: string | null; // 一句话起因;无可靠信息时为 null
  asOf: string | null; // 依据信息的大致日期 YYYY-MM-DD
  sourceUrl: string | null; // 可核实来源(检索路径才有)
}

const EMPTY: WhyResult = { reason: null, asOf: null, sourceUrl: null };

// 进程内缓存,按 code+date,避免同一天重复检索/打模型
const cache = new Map<string, WhyResult>();

/* ---------- 路径 1:博查检索增强 ---------- */
const RAG_PROMPT = `你要根据【检索材料】解释某只美股最近一个交易日为什么明显异动。
铁律(违反即失败):
- 只能使用材料里出现的、可核实的公开事实(财报/官方公告/权威新闻)。
- 材料中若没有能解释本次异动的明确事件 → reason 必须为 null。
- 绝不使用材料之外的知识或猜测,不写"可能/或因/预计"之类硬凑因果。
- reason 给出时为一句话(≤40字,中文),并给出 asOf(该事件依据材料的日期 YYYY-MM-DD),
  sourceIndex 指向你引用的材料编号(整数)。
只输出 JSON:{"reason":string|null,"asOf":string|null,"sourceIndex":number|null},不要多余文字。`;

/* eslint-disable @typescript-eslint/no-explicit-any */
async function retrievalWhy(
  client: any,
  name: string,
  code: string,
  date: string
): Promise<WhyResult> {
  const hits = await bochaSearch(
    `${name}(${code}) 美股 股价 大涨 大跌 异动 原因 财报 公告`,
    { count: 8, freshness: "oneWeek" }
  );
  if (!hits || hits.length === 0) return EMPTY; // 搜不到就不编

  const material = hits
    .map(
      (h: BochaHit, i: number) =>
        `[${i + 1}] ${h.datePublished ?? "日期不详"} ${h.siteName ?? ""}:${h.name} — ${(
          h.summary || h.snippet
        ).slice(0, 240)}`
    )
    .join("\n");

  try {
    const resp = await client.chat.completions.create({
      model: process.env.WHY_LLM_MODEL || LLM_MODEL,
      max_tokens: 400,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: RAG_PROMPT },
        {
          role: "user",
          content: `美股:${name}(${code}),简报日 ${date}。\n\n【检索材料】\n${material}\n\n请仅依据以上材料判断它最近为什么异动。`,
        },
      ],
    });
    const txt = resp.choices[0]?.message?.content ?? "{}";
    const p = JSON.parse(txt) as {
      reason?: unknown;
      asOf?: unknown;
      sourceIndex?: unknown;
    };
    const reason =
      typeof p.reason === "string" && p.reason.trim() ? p.reason.trim() : null;
    if (!reason) return EMPTY;
    const idx =
      typeof p.sourceIndex === "number" && p.sourceIndex >= 1
        ? Math.floor(p.sourceIndex) - 1
        : -1;
    const src = hits[idx];
    return {
      reason,
      asOf:
        (typeof p.asOf === "string" && p.asOf.trim() ? p.asOf.trim() : null) ??
        src?.datePublished ??
        null,
      sourceUrl: src?.url ?? null,
    };
  } catch {
    return EMPTY;
  }
}

/* ---------- 路径 2:兼容旧的纯模型路径 ---------- */
const LEGACY_PROMPT = `你要解释某只美股"最近一个交易日为什么明显异动"。
铁律(违反即失败):
- 只有当你掌握"近几日、可核实的公开事实(官方公告/财报/权威新闻)"时,才给出 reason。
- 一旦不确定、或信息可能过时、或要靠猜测,reason 必须为 null。绝不编造。
- reason 给出时为一句话(≤40字,中文),并在 asOf 写出依据信息的大致日期(YYYY-MM-DD)。
只输出 JSON:{"reason": string|null, "asOf": string|null},不要任何多余文字。`;

async function legacyWhy(
  client: any,
  name: string,
  code: string
): Promise<WhyResult> {
  try {
    const resp = await client.chat.completions.create({
      model: process.env.WHY_LLM_MODEL || LLM_MODEL,
      max_tokens: 300,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: LEGACY_PROMPT },
        {
          role: "user",
          content: `美股:${name}(${code})。它最近一个交易日为什么异动?`,
        },
      ],
    });
    const txt = resp.choices[0]?.message?.content ?? "{}";
    const p = JSON.parse(txt) as { reason?: unknown; asOf?: unknown };
    return {
      reason:
        typeof p.reason === "string" && p.reason.trim() ? p.reason.trim() : null,
      asOf: typeof p.asOf === "string" && p.asOf.trim() ? p.asOf.trim() : null,
      sourceUrl: null,
    };
  } catch {
    return EMPTY;
  }
}
/* eslint-enable @typescript-eslint/no-explicit-any */

export async function explainMove(
  name: string,
  code: string,
  date: string
): Promise<WhyResult> {
  const key = `${code}:${date}`;
  const cached = cache.get(key);
  if (cached) return cached;

  const client = getLLM();
  if (!client) return EMPTY;

  let out: WhyResult = EMPTY;
  if (bochaEnabled()) {
    out = await retrievalWhy(client, name, code, date); // 优先真实检索
  } else if (process.env.WHY_ENABLED) {
    out = await legacyWhy(client, name, code); // 兼容旧开关
  } else {
    return EMPTY; // 默认关:既没检索也没显式开启,不打模型
  }
  // 只缓存"成功拿到 reason"的结果;空结果可能源于偶发超时/失败,不缓存以便下次重试。
  if (out.reason) cache.set(key, out);
  return out;
}
