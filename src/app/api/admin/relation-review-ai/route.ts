import { NextRequest, NextResponse } from "next/server";
import { isAdminAuthorized } from "@/lib/api-guard";
import { isAdminSession } from "@/lib/admin";
import { relationInChain, type RelationType } from "@/data/chain-relations";
import { STOCK_MAP } from "@/data/stocks";
import { getLLM, chatTimed, LLM_MODEL_FAST } from "@/lib/llm";
import { upsertReviewItem } from "@/lib/relation-review";
import { todayISO } from "@/lib/date";
import { AI_REVIEW_MAX_ITEMS, AI_REVIEW_POOL } from "@/lib/ai-review-const";

export const dynamic = "force-dynamic";
// LLM 审阅按 4 路并发池执行(每条 ~10-20s):12 条最坏 ~60s,300s 上限给足。
// 上限 12=一条链一次审完;再大不是时间问题而是终审质量问题(一次给人 20 条建议没人细看)。
export const maxDuration = 300;

// AI 审阅(2.2-C 对话能力试点,2026-07-07 负责人拍板):管理员勾选关系 → LLM 按关系口径逐条
// 给建议(建议档位/理由/需补证据/验证点)→ 写入 relationReviewQueue(source=ai-review)→
// 人工在审阅队列面板通过/拒绝。
// 【铁律】AI 只产建议:本路由没有任何写 staticRelations 的能力(不变量#4);
// AI 依据的是训练知识+库内既有信息,业务事实(订单/客户/收入)必须人工核实——建议仅供参考。
const MAX_ITEMS = AI_REVIEW_MAX_ITEMS;
const VALID_TYPES = new Set(["direct", "indirect", "sentiment", "weak", "candidate"]);

const SYSTEM_PROMPT = `你是 StockTell 产业链关系库的审阅助手。对给出的「股票×产业链」关系,按以下口径给出档位建议:
- direct(直接映射):传导链条短且有明确业务入口(向该链核心环节供货/提供核心产品),需订单、客户、收入占比可验证;
- indirect(间接映射):受益链条存在但隔了一层或业务暴露不纯,需环节变化与业务披露验证;
- sentiment(情绪映射):同主题联想,缺直接业务传导;
- weak(弱映射):关系远,仅外围观察;
- candidate(待验证):信息不足以判档;
- remove(移出):主营与该链无实质关系。
规则:①宁可保守,证据不足就 candidate,不确定的业务事实要在 evidenceNeeded 里列出让人工核实;②全程中性研究口径,不用任何买卖/涨跌/受益确定性话术;③只输出 JSON,不要输出其它文字。
analysis 字段是【判定过程】,必须包含三段(用中文分号分隔):
(a) 业务传导路径:该股主营如何进入这条链的哪个环节;
(b) 档位辨析:为什么是建议档而不是相邻的上一档/下一档(各给一句排除理由);
(c) 证据现状:已知什么支撑、缺什么关键证据。150~250字。
输出格式:{"suggestedType":"direct|indirect|sentiment|weak|candidate|remove","rationale":"一句话结论(≤40字)","analysis":"判定过程(按 a/b/c 三段)","evidenceNeeded":["需人工核实的证据,1-3条"],"verificationPoints":["建议验证点,1-3条"]}`;

type AiSuggestion = {
  code: string;
  name: string;
  chainId: string;
  currentType: string;
  suggestedType: string;
  rationale: string;
  analysis: string; // 判定过程(负责人反馈:要理由不要只给结果)
  evidenceNeeded: string[];
  verificationPoints: string[];
  queued: boolean;
  error?: string;
};

export async function POST(req: NextRequest) {
  if (!isAdminAuthorized(req) && !(await isAdminSession())) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }
  const llm = getLLM({ timeoutMs: 45_000, maxRetries: 1 }); // W5:收紧超时,防单条挂起坐满 300s 预算
  if (!llm) {
    return NextResponse.json({ ok: false, error: "LLM 未配置(缺 LLM_API_KEY)" }, { status: 503 });
  }
  const body = (await req.json().catch(() => null)) as {
    items?: Array<{ code?: string; chainId?: string }>;
  } | null;
  const requested = (body?.items ?? []).filter(
    (i): i is { code: string; chainId: string } => !!i?.code && !!i?.chainId
  );
  // W7(五轮 review):校验下沉服务端——超量不静默 slice(响应回报 truncated),
  // trigger 关系服务端过滤(触发源不参与档位审阅,不能只靠客户端不勾选)。
  const truncated = requested.length > MAX_ITEMS;
  const items = requested.slice(0, MAX_ITEMS);
  if (items.length === 0) {
    return NextResponse.json({ ok: false, error: `empty-items(每次最多 ${MAX_ITEMS} 条)` }, { status: 400 });
  }

  const date = todayISO();
  const client = llm; // 上方已判空;闭包内 TS 无法跨函数收窄,固定为非空引用
  async function reviewOne(it: { code: string; chainId: string }): Promise<AiSuggestion> {
    const rel = relationInChain(it.code, it.chainId);
    const st = STOCK_MAP[it.code];
    if (!rel || !st) {
      return {
        code: it.code, name: st?.name ?? it.code, chainId: it.chainId,
        currentType: rel?.relationType ?? "-", suggestedType: "-",
        rationale: "", analysis: "", evidenceNeeded: [], verificationPoints: [],
        queued: false, error: "relation-not-found",
      };
    }
    if (rel.relationType === "trigger") {
      return {
        code: it.code, name: st.name, chainId: it.chainId,
        currentType: "trigger", suggestedType: "-",
        rationale: "", analysis: "", evidenceNeeded: [], verificationPoints: [],
        queued: false, error: "trigger-not-reviewable(触发源不参与档位审阅)",
      };
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
        client.chat.completions.create({
          model: LLM_MODEL_FAST,
          messages: [
            { role: "system", content: SYSTEM_PROMPT },
            { role: "user", content: user },
          ],
          temperature: 0.2,
          max_tokens: 1500, // W10:判定过程+两数组的余量(推理模型可能把思考计入)
          response_format: { type: "json_object" },
        })
      );
      const raw = resp.choices[0]?.message?.content ?? "";
      let jsonText = raw.trim().replace(/^```(?:json)?/i, "").replace(/```$/, "").trim();
      // W10 兜底:非首尾围栏/夹带文字时,截取首个平衡 {...} 块再试
      if (!jsonText.startsWith("{")) {
        const m = jsonText.match(/\{[\s\S]*\}/);
        if (m) jsonText = m[0];
      }
      const parsed = JSON.parse(jsonText) as {
        suggestedType?: string; rationale?: string; analysis?: string;
        evidenceNeeded?: string[]; verificationPoints?: string[];
      };
      const sug = String(parsed.suggestedType ?? "candidate");
      const rationale = String(parsed.rationale ?? "").slice(0, 80);
      const analysis = String(parsed.analysis ?? "").slice(0, 400);
      const evidence = (parsed.evidenceNeeded ?? []).map(String).slice(0, 3);
      const verify = (parsed.verificationPoints ?? []).map(String).slice(0, 3);
      // 入审阅队列(人工终审入口):suggestedType 仅收合法档;remove 建议以文字呈现,档位留空
      await upsertReviewItem({
        code: it.code,
        chainId: it.chainId,
        date,
        source: "ai-review",
        // W4:remove 裁决显式清空建议档(null 覆写),防隔日翻转时徽章残留旧档
        suggestedType: VALID_TYPES.has(sug) ? (sug as RelationType) : sug === "remove" ? null : undefined,
        reason: `AI 审阅建议:${sug}(现档 ${rel.relationType})。${rationale} 判定过程:${analysis}${evidence.length ? ` 需人工核实:${evidence.join("、")}` : ""}`,
      });
      return {
        code: it.code, name: st.name, chainId: it.chainId,
        currentType: rel.relationType, suggestedType: sug,
        rationale, analysis, evidenceNeeded: evidence, verificationPoints: verify, queued: true,
      };
    } catch (e) {
      return {
        code: it.code, name: st.name, chainId: it.chainId,
        currentType: rel.relationType, suggestedType: "-",
        rationale: "", analysis: "", evidenceNeeded: [], verificationPoints: [],
        queued: false, error: String(e).slice(0, 120),
      };
    }
  }
  // 4 路并发池:比 Promise.all 全放温和(不给 LLM 网关一次拍 12 个),比串行快 3-4 倍
  const out: AiSuggestion[] = new Array(items.length);
  let cursor = 0;
  await Promise.all(
    Array.from({ length: Math.min(AI_REVIEW_POOL, items.length) }, async () => {
      while (cursor < items.length) {
        const i = cursor++;
        out[i] = await reviewOne(items[i]);
      }
    })
  );
  return NextResponse.json({ ok: true, suggestions: out, ...(truncated ? { truncated: true, accepted: items.length, requested: requested.length } : {}) });
}
