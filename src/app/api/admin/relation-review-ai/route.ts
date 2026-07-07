import { NextRequest, NextResponse } from "next/server";
import { isAdminAuthorized } from "@/lib/api-guard";
import { isAdminSession } from "@/lib/admin";
import { relationInChain, type RelationType } from "@/data/chain-relations";
import { STOCK_MAP } from "@/data/stocks";
import { getLLM, chatTimed, LLM_MODEL_FAST } from "@/lib/llm";
import { upsertReviewItem } from "@/lib/relation-review";
import { todayISO } from "@/lib/date";

export const dynamic = "force-dynamic";
// 逐条 LLM 审阅(串行,每条 ~10-20s),上限 5 条/次 → 最坏 ~100s,300s 上限给足
export const maxDuration = 300;

// AI 审阅(2.2-C 对话能力试点,2026-07-07 负责人拍板):管理员勾选关系 → LLM 按关系口径逐条
// 给建议(建议档位/理由/需补证据/验证点)→ 写入 relationReviewQueue(source=ai-review)→
// 人工在审阅队列面板通过/拒绝。
// 【铁律】AI 只产建议:本路由没有任何写 staticRelations 的能力(不变量#4);
// AI 依据的是训练知识+库内既有信息,业务事实(订单/客户/收入)必须人工核实——建议仅供参考。
const MAX_ITEMS = 5;
const VALID_TYPES = new Set(["direct", "indirect", "sentiment", "weak", "candidate"]);

const SYSTEM_PROMPT = `你是 StockTell 产业链关系库的审阅助手。对给出的「股票×产业链」关系,按以下口径给出档位建议:
- direct(直接映射):传导链条短且有明确业务入口(向该链核心环节供货/提供核心产品),需订单、客户、收入占比可验证;
- indirect(间接映射):受益链条存在但隔了一层或业务暴露不纯,需环节变化与业务披露验证;
- sentiment(情绪映射):同主题联想,缺直接业务传导;
- weak(弱映射):关系远,仅外围观察;
- candidate(待验证):信息不足以判档;
- remove(移出):主营与该链无实质关系。
规则:①宁可保守,证据不足就 candidate,不确定的业务事实要在 evidenceNeeded 里列出让人工核实;②rationale 用中性研究口径,不用任何买卖/涨跌/受益确定性话术;③只输出 JSON,不要输出其它文字。
输出格式:{"suggestedType":"direct|indirect|sentiment|weak|candidate|remove","rationale":"≤80字理由","evidenceNeeded":["需人工核实的证据,1-3条"],"verificationPoints":["建议验证点,1-3条"]}`;

type AiSuggestion = {
  code: string;
  name: string;
  chainId: string;
  currentType: string;
  suggestedType: string;
  rationale: string;
  evidenceNeeded: string[];
  verificationPoints: string[];
  queued: boolean;
  error?: string;
};

export async function POST(req: NextRequest) {
  if (!isAdminAuthorized(req) && !(await isAdminSession())) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }
  const llm = getLLM();
  if (!llm) {
    return NextResponse.json({ ok: false, error: "LLM 未配置(缺 LLM_API_KEY)" }, { status: 503 });
  }
  const body = (await req.json().catch(() => null)) as {
    items?: Array<{ code?: string; chainId?: string }>;
  } | null;
  const items = (body?.items ?? [])
    .filter((i): i is { code: string; chainId: string } => !!i?.code && !!i?.chainId)
    .slice(0, MAX_ITEMS);
  if (items.length === 0) {
    return NextResponse.json({ ok: false, error: "empty-items(每次最多 5 条)" }, { status: 400 });
  }

  const date = todayISO();
  const out: AiSuggestion[] = [];
  for (const it of items) {
    const rel = relationInChain(it.code, it.chainId);
    const st = STOCK_MAP[it.code];
    if (!rel || !st) {
      out.push({
        code: it.code, name: st?.name ?? it.code, chainId: it.chainId,
        currentType: rel?.relationType ?? "-", suggestedType: "-",
        rationale: "", evidenceNeeded: [], verificationPoints: [],
        queued: false, error: "relation-not-found",
      });
      continue;
    }
    const user = [
      `股票:${st.name}(${it.code}),板块:${st.sector},定位:${st.positioning}`,
      st.observation ? `观察要点:${st.observation}` : "",
      `目标链:${rel.chainName}(${it.chainId}),环节:${rel.segmentName}`,
      `当前档位:${rel.relationType},当前理由:${rel.reason}`,
      `请按口径给出该股在【这条链】的档位建议。`,
    ].filter(Boolean).join("\n");
    try {
      const resp = await chatTimed("relation-review-ai", "primary", () =>
        llm.chat.completions.create({
          model: LLM_MODEL_FAST,
          messages: [
            { role: "system", content: SYSTEM_PROMPT },
            { role: "user", content: user },
          ],
          temperature: 0.2,
          max_tokens: 500,
        })
      );
      const raw = resp.choices[0]?.message?.content ?? "";
      const jsonText = raw.trim().replace(/^```(?:json)?/i, "").replace(/```$/, "").trim();
      const parsed = JSON.parse(jsonText) as {
        suggestedType?: string; rationale?: string;
        evidenceNeeded?: string[]; verificationPoints?: string[];
      };
      const sug = String(parsed.suggestedType ?? "candidate");
      const rationale = String(parsed.rationale ?? "").slice(0, 160);
      const evidence = (parsed.evidenceNeeded ?? []).map(String).slice(0, 3);
      const verify = (parsed.verificationPoints ?? []).map(String).slice(0, 3);
      // 入审阅队列(人工终审入口):suggestedType 仅收合法档;remove 建议以文字呈现,档位留空
      await upsertReviewItem({
        code: it.code,
        chainId: it.chainId,
        date,
        source: "ai-review",
        suggestedType: VALID_TYPES.has(sug) ? (sug as RelationType) : undefined,
        reason: `AI 审阅建议:${sug}(现档 ${rel.relationType})。${rationale}${evidence.length ? ` 需人工核实:${evidence.join("、")}` : ""}`,
      });
      out.push({
        code: it.code, name: st.name, chainId: it.chainId,
        currentType: rel.relationType, suggestedType: sug,
        rationale, evidenceNeeded: evidence, verificationPoints: verify, queued: true,
      });
    } catch (e) {
      out.push({
        code: it.code, name: st.name, chainId: it.chainId,
        currentType: rel.relationType, suggestedType: "-",
        rationale: "", evidenceNeeded: [], verificationPoints: [],
        queued: false, error: String(e).slice(0, 120),
      });
    }
  }
  return NextResponse.json({ ok: true, suggestions: out });
}
