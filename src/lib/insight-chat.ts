// 情境式追问 · 服务端核心(PRD prd-trust-chat-pro-intent §5,PR4)。
// 形态:只在 /insight 页、锚点绑定(judgment/risk/hop/heat/mapping),不是通用股票聊天。
// 三道护栏纵深:
//   ① 输入意图规则(确定性,买卖/预测/仓位/择时词面 100% 重定向,不进 LLM);
//   ② 对话专用 system prompt(逐轮重锚 + JSON 合同,【不复用】briefing/explain 的旧 SYS——
//      旧提示词含"机会还是陷阱/超跌/企稳"等择时语义,PRD §2.4 明令不可复用);
//   ③ 输出过滤(content-guard 禁词+涨跌数字;命中即整答替换为安全重定向,绝不放行原文)。
// 上下文全部服务端按 slug/date/anchor 装配,不信任客户端传入正文;引用只能用服务端注册的
// reference id(白名单校验,grounded 无有效引用一律降级 no_evidence)。
import { INSIGHT_CHAINS, type InsightChain } from "@/data/insight-chains";
import { CHAINS } from "@/data/chains";
import { getPublishedDaily } from "@/lib/insight-pipeline/docs";
import {
  fromInsightRef,
  dailyRefsFor,
  matchReferences,
  type EvidenceItem,
} from "@/lib/evidence";
import { todayISO } from "@/lib/date";
import { resolveInChain } from "@/lib/relation-resolver";
import { chainIdFromSlug } from "@/lib/relation-rank";
import { listWatchlist } from "@/lib/watchlist";
import { STOCK_MAP } from "@/data/stocks";
import { scanBannedWords, hasSpecificMove } from "@/lib/content-guard";
import { getLLMFor } from "@/lib/llm-provider";
import { chatTimed } from "@/lib/llm";

export type ChatAnchorType = "judgment" | "risk" | "hop" | "heat" | "mapping";
export type ChatAnchor = { type: ChatAnchorType; id: string };

// 回答合同(PRD §5.3):每轮固定结构化 JSON,前端渲染,不让模型自由决定版式。
export type GroundedAnswer = {
  oneLiner: string;
  explanation: string[];
  referenceIds: string[];
  uncertainty: string;
  result: "grounded" | "no_evidence" | "redirected";
};
export type ChatReferenceOut = { id: string; name: string; url?: string };

export const CHAT_QUESTION_MAX = 300; // 单次输入上限(PRD §5.6)
export const CHAT_DAILY_LIMIT = 10; // 每用户每天问题数(PRD §5.6)

export const chatEnabled = () => process.env.INSIGHT_CHAT_ENABLED === "1"; // 功能总开关(§5.6)

// ---- ① 输入意图规则(确定性重定向;LLM 分类只是纵深,不作唯一闸)----
// 买卖/涨跌预测/目标价/仓位/择时词面。宁可误伤后靠建议问题引导,不可漏放(验收:100% 重定向)。
// review P1 修订:补「持有/调仓/上涨空间/买卖点/操作建议/波段」等常见绕过族;
// 「操作」排除「操作系统」(insight 语境的真实误伤源);词表变更必须同步 scripts/chat-guard-test.ts。
const TRADING_INTENT = new RegExp(
  [
    // 买卖动作
    "买|卖|入手|上车|进场|离场|出货|接盘|出掉|该出|出手|抛|建仓|清仓|平仓",
    // 仓位管理
    "加仓|减仓|补仓|换仓|调仓|满仓|空仓|梭哈|全仓|半仓|重仓|轻仓|几成仓|仓位|减持点|增持点",
    // 持有/退出族(review 点名)
    "持有|持仓|拿住|拿着|继续拿|还能拿|拿多久|割肉|解套|回本|落袋|获利了结|止损|止盈|止益",
    // 涨跌预测/空间(review 点名)
    "能涨|会涨|要涨|能跌|会跌|要跌|涨到|跌到|翻倍|涨停|跌停|上涨空间|下跌空间|涨幅空间|空间多大|还有多少空间|能到多少|涨多少|跌多少",
    // 价格/点位/择时
    "目标价|什么价位|多少钱可以|什么点位|买点|卖点|入场点|进出点|现在进|明天走势|后市怎么|择时|时机|等回调|抢反弹|博反弹",
    // 操作建议/风格(排除「操作系统」)
    "操作(?!系统)|怎么办|如何布局|怎么布局|值得买|值得入|能不能买|可以买|该买|该不该买|做T|打板|波段|短线|抄底|低吸|高抛|追高|追进",
    // 盈亏
    "挣钱|赚钱|赔钱|亏钱|能赚|会亏",
  ].join("|")
);
export function classifyIntent(q: string): "trading" | "pass" {
  return TRADING_INTENT.test(q) || scanBannedWords(q).length > 0 ? "trading" : "pass";
}

// 无依据安全答(review P1:模型自报 no_evidence 或 grounded 被降级时,【不得】展示模型
// 生成的正文——那段话本身就是没有引用支撑的断言,展示它=幻觉正文过闸。整答替换为固定文案。)
export function noEvidenceAnswer(anchorLabel: string): GroundedAnswer {
  return {
    oneLiner: "当前给定的材料不足以回答这个问题——我们不用模型的训练记忆补当前事实。",
    explanation: [
      `可以先看${anchorLabel}旁的引用来源自行核实,或换一个更贴近本锚点已有材料的问法。`,
    ],
    referenceIds: [],
    uncertainty: "本轮未给出判断。",
    result: "no_evidence",
  };
}

// 重定向安全答(规则命中/输出违规/模型自报 redirected 共用;引用清空,免责由应用层固定追加)
export function redirectedAnswer(anchorLabel: string): GroundedAnswer {
  return {
    oneLiner: "这个问题涉及买卖决策或行情预测,StockTell 不做这类判断——个股永远只是关系分级的说明性示例。",
    explanation: [
      `可以换个角度问:${anchorLabel}的依据是什么、哪个前提不成立时会失效、要用哪些公开信息验证。`,
      "我们能帮你的是产业链解释、关系强弱和验证条件,买卖决策请依据自己的判断与风险承受能力。",
    ],
    referenceIds: [],
    uncertainty: "本轮未作产业链判断。",
    result: "redirected",
  };
}

/* ---------- 上下文装配(服务端唯一来源) ---------- */
export type ChatContext = {
  chain: InsightChain;
  anchorLabel: string; // 「AI 推理基础设施链 · 光模块环节」之类,面板顶部与重锚都用
  contextText: string; // 喂给模型的锚点材料(全部来自已审内容)
  allowedRefs: Map<string, ChatReferenceOut>; // 模型可引用的白名单(id → 展示信息)
};

export async function assembleChatContext(
  slug: string,
  date: string | undefined,
  anchor: ChatAnchor,
  userId: string
): Promise<ChatContext | null> {
  const chain = INSIGHT_CHAINS[slug];
  if (!chain) return null;
  const chainPage = Object.values(CHAINS).find((c) => c.insightSlug === slug);
  const daily = chainPage
    ? await getPublishedDaily(chainPage.id, date ?? todayISO()).catch(() => null)
    : null;
  const relChainId = chainIdFromSlug(slug);
  const chainTitle = chain.title.replace(" · 因果链", "");

  const allowedRefs = new Map<string, ChatReferenceOut>();
  const ctx: string[] = [`产业链:${chainTitle}。定位:${chain.oneLinerPlain}`];

  // 引用白名单【按锚点收窄】(review P1:此前注册整条链全部引用,模型可拿无关来源把
  // 回答"洗成"grounded)。只注册支撑当前锚点的来源——复用展示层同一套匹配
  // (静态 targets/文本规则、当日 targets),两侧口径一致。收窄后为空=模型只能 no_evidence,诚实。
  const staticEv = chain.references.map(fromInsightRef);
  const anchorEv: EvidenceItem[] =
    anchor.type === "hop"
      ? matchReferences({ type: "hop", order: Number(anchor.id) }, staticEv)
      : anchor.type === "heat"
        ? matchReferences({ type: "heat", segment: anchor.id }, staticEv)
        : anchor.type === "mapping"
          ? matchReferences(
              { type: "mapping", name: anchor.id, code: anchor.id },
              staticEv
            )
          : // judgment/risk:当日材料(触发事件新闻+常设核实入口)。risk 本身无直接支撑来源
            // (证伪点属推理,展示层如实标推理假设),但解释风险可引用当日事实材料,故同集。
            (daily ? dailyRefsFor("judgment", daily.payload.references) : []);
  anchorEv.forEach((e, i) => {
    const id = `a${i + 1}`;
    allowedRefs.set(id, { id, name: e.name, url: e.url });
    ctx.push(
      `[来源 ${id}] ${e.name}(${e.kind === "standing" ? "常设核实入口" : "具体来源"})支撑:${e.supports ?? "—"}`
    );
  });
  if (daily) {
    ctx.push(`当日(${daily.date})链级判断:${daily.payload.judgment}`);
    ctx.push(`当日风险:${daily.payload.risk}`);
  }

  // 锚点材料
  let anchorLabel = `「${chainTitle}」`;
  if (anchor.type === "hop") {
    const hop = [...chain.mainHops, ...chain.branchHops].find((h) => String(h.order) === anchor.id);
    if (!hop) return null;
    anchorLabel = `这一跳(${hop.from} → ${hop.to})`;
    ctx.push(
      `当前锚点=因果链第 ${hop.order} 跳:${hop.plain}\n专业逻辑:${hop.logic}\n依据类型:${hop.evidenceType}${hop.evidenceExample ? `(${hop.evidenceExample})` : ""}\n置信:${hop.confidence}${hop.caveat ? `\n证伪/反面:${hop.caveat}` : ""}`
    );
  } else if (anchor.type === "heat") {
    const row = chain.heatmap.find((h) => h.segment === anchor.id);
    if (!row) return null;
    anchorLabel = `「${row.segment}」环节`;
    const hop = row.hopOrder ? chain.branchHops.find((h) => h.order === row.hopOrder) : null;
    ctx.push(
      `当前锚点=产业环节「${row.segment}」(${row.plain}):方向 ${row.direction},关系 ${row.relation ?? "—"},原因:${row.reason}${hop ? `\n传导:${hop.plain}(${hop.logic})` : ""}`
    );
  } else if (anchor.type === "mapping") {
    const m = chain.mappings.find((x) => (x.code ?? x.name) === anchor.id);
    if (!m) return null;
    anchorLabel = `${m.name} 为什么被映射`;
    const rel = m.code ? resolveInChain(m.code, relChainId) : null;
    ctx.push(
      `当前锚点=个股映射 ${m.name}${m.code ? `(${m.code})` : ""}:环节 ${m.segment},关系 ${m.relation}(传导层级,非受益程度),理由:${m.reason},置信:${m.confidence}` +
        (rel ? `\n核定关系档:${rel.relationType};验证点:${rel.verificationPoints.join("、")}` : "")
    );
    // 关系档 references 也入白名单(rel:1..n)
    rel?.references?.forEach((r, i) => {
      const id = `rel${i + 1}`;
      allowedRefs.set(id, { id, name: r.title, url: r.url });
      ctx.push(`[来源 ${id}] ${r.title}(关系档·${r.sourceType})${r.note ? ` ${r.note}` : ""}`);
    });
  } else if (anchor.type === "risk") {
    anchorLabel = "当前风险/证伪条件";
    ctx.push(`当前锚点=今日风险:${daily?.payload.risk ?? chain.tldr.risk}`);
  } else {
    anchorLabel = "今日判断";
    ctx.push(`当前锚点=今日判断:${daily?.payload.judgment ?? chain.oneLinerPlain}`);
  }

  // 登录用户自选(只给 code/名称/本链关系;绝不传成本/仓位/交易记录——本来也没有)
  try {
    const codes = await listWatchlist(userId);
    const rels = codes
      .map((c) => ({ c, r: resolveInChain(c, relChainId) }))
      .filter((x) => x.r)
      .slice(0, 10)
      .map((x) => `${STOCK_MAP[x.c]?.name ?? x.c}(${x.c}):${x.r!.relationType}`);
    if (rels.length) ctx.push(`用户自选中与本链有核定关系的:${rels.join(";")}`);
  } catch {
    /* 自选读取失败不影响追问 */
  }

  return { chain, anchorLabel, contextText: ctx.join("\n"), allowedRefs };
}

/* ---------- LLM 调用 + 合同校验 + 输出过滤 ---------- */
const CHAT_SYS = `你是 StockTell 的产业链推理讲解助手,只围绕「当前锚点」的给定材料回答 A 股散户的追问。人话为主、专业为辅,结论先行。
铁律(每轮重申):
1. 绝不输出买卖/加减仓/目标价/涨跌预测/仓位/择时建议;用户问这类 → result="redirected",并把话题引回当前锚点的事实、关系强弱与验证条件。
2. 只依据给定材料回答;referenceIds 只能取给定的来源 id。材料不足以回答 → result="no_evidence",绝不用你的训练知识补成当前事实。
3. 与当前锚点无关的话题 → result="redirected"。
4. 禁盘口词(企稳/放量/缩量/低吸/抄底/破位/补跌/接/冲/追等),不带具体涨跌数字,不用吓人词,不写免责声明(应用层统一加)。
只输出一个 JSON 对象,不要任何其他文字:
{"oneLiner":"一句话回答(≤80字)","explanation":["最多3条解释,每条≤120字"],"referenceIds":["引用的来源id"],"uncertainty":"这个回答的不确定性(≤100字)","result":"grounded|no_evidence|redirected"}`;

function parseAnswer(raw: string | null | undefined): GroundedAnswer | null {
  if (!raw) return null;
  const s = raw.trim().replace(/^```(?:json)?/i, "").replace(/```$/, "").trim();
  const m = s.match(/\{[\s\S]*\}/);
  if (!m) return null;
  try {
    const o = JSON.parse(m[0]) as Partial<GroundedAnswer>;
    if (typeof o.oneLiner !== "string" || !o.oneLiner.trim()) return null;
    if (!["grounded", "no_evidence", "redirected"].includes(o.result ?? "")) return null;
    return {
      oneLiner: o.oneLiner.trim().slice(0, 120),
      explanation: (Array.isArray(o.explanation) ? o.explanation : [])
        .filter((x): x is string => typeof x === "string" && !!x.trim())
        .slice(0, 3)
        .map((x) => x.trim().slice(0, 200)),
      referenceIds: (Array.isArray(o.referenceIds) ? o.referenceIds : []).filter(
        (x): x is string => typeof x === "string"
      ),
      uncertainty: typeof o.uncertainty === "string" ? o.uncertainty.trim().slice(0, 160) : "",
      result: o.result as GroundedAnswer["result"],
    };
  } catch {
    return null;
  }
}

export type ChatHistoryTurn = { role: "user" | "assistant"; text: string };

// 返回 null = 基础设施失败(LLM 不可用/超时/解析失败)→ 调用方退还额度并回「可重试」,
// 绝不回退成无来源模板答案(PRD §5.6)。
export async function runInsightChat(
  ctx: ChatContext,
  question: string,
  history: ChatHistoryTurn[]
): Promise<{ answer: GroundedAnswer; provider: string } | null> {
  const llm = await getLLMFor("fast");
  if (!llm) return null;
  const messages: { role: "system" | "user" | "assistant"; content: string }[] = [
    { role: "system", content: CHAT_SYS },
    {
      role: "user",
      content: `【当前锚点材料(唯一依据)】\n${ctx.contextText}\n\n【当前锚点】${ctx.anchorLabel}`,
    },
    // 最近 6 轮(服务端裁剪);逐轮重锚靠下面把锚点再拼进本轮问题
    ...history.slice(-12).map((h) => ({ role: h.role, content: h.text.slice(0, 400) })),
    { role: "user", content: `(仍然只围绕${ctx.anchorLabel})${question}` },
  ];
  try {
    const resp = await chatTimed("insight-chat", llm.provider, () =>
      llm.client.chat.completions.create(
        { model: llm.model, max_tokens: 800, messages },
        { maxRetries: 1, timeout: 20000 }
      )
    );
    const parsed = parseAnswer(resp.choices[0]?.message?.content);
    if (!parsed) return null;
    // 引用白名单:只留服务端注册 id;grounded 但无有效引用 → 降级 no_evidence(验收硬线)
    parsed.referenceIds = parsed.referenceIds.filter((id) => ctx.allowedRefs.has(id));
    if (parsed.result === "grounded" && parsed.referenceIds.length === 0)
      parsed.result = "no_evidence";
    // review P1:非 grounded 的模型正文一律不展示——no_evidence 的正文=无引用断言(幻觉过闸),
    // redirected 的正文=模型自由发挥的拒答(可能跑偏)。都换成应用层固定文案。
    if (parsed.result === "no_evidence")
      return { answer: noEvidenceAnswer(ctx.anchorLabel), provider: llm.provider };
    if (parsed.result === "redirected")
      return { answer: redirectedAnswer(ctx.anchorLabel), provider: llm.provider };
    // ③ 输出过滤(此时只剩 grounded):禁词/具体涨跌数字命中 → 整答替换,绝不放行原文
    const prose = [parsed.oneLiner, ...parsed.explanation, parsed.uncertainty].join("\n");
    if (scanBannedWords(prose).length > 0 || hasSpecificMove(prose)) {
      return { answer: redirectedAnswer(ctx.anchorLabel), provider: llm.provider };
    }
    return { answer: parsed, provider: llm.provider };
  } catch {
    return null;
  }
}
