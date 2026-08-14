// Change Detection(2.2.6,负责人拍板):用户不关心「当前是什么」,关心「今天有什么是
// 昨天不知道的」。只主动突出真变化:intent 改/产业逻辑改/验证改/出现新 trigger/
// confidence 明显变化;没变化就一句「与昨日相比没有方向性变化」,绝不硬生成。
// computeJudgmentChanges 是纯函数(fixture 可断言防漂移);loadPrevJudgments 读存档。
import { getPrisma } from "@/lib/prisma";
import type { ChainJudgment, IndustryLogic, VerificationState } from "@/lib/judgment";

export interface JudgmentChange {
  field: "intent" | "logic" | "verification" | "trigger" | "confidence";
  text: string; // 人话:「资金意图 分歧 → 派发特征」
}

const LOGIC_SHORT: Record<IndustryLogic, string> = {
  strengthen: "增强",
  unchanged: "不变",
  weaken: "减弱",
  sentiment: "情绪为主",
};
const VERIF_SHORT: Record<VerificationState, string> = {
  new: "新验证",
  partial: "部分线索",
  none: "无新证据",
  contrary: "出现反证",
};

// 昨日 → 今日的方向性变化(prev 缺失=无历史,返回空;旧存档缺 hasEvent/confidenceRaw 字段时
// 对应检测跳过,不误报)。confidence 只报「明显变化」= low↔high 两端跳变,medium 相邻不报。
export function computeJudgmentChanges(
  prev: ChainJudgment | null | undefined,
  today: ChainJudgment
): JudgmentChange[] {
  if (!prev) return [];
  const out: JudgmentChange[] = [];
  if (prev.intent !== today.intent)
    out.push({ field: "intent", text: `资金意图 ${prev.intentLabel} → ${today.intentLabel}` });
  if (prev.logic !== today.logic)
    out.push({ field: "logic", text: `产业逻辑 ${LOGIC_SHORT[prev.logic]} → ${LOGIC_SHORT[today.logic]}` });
  if (prev.verification !== today.verification)
    out.push({ field: "verification", text: `验证 ${VERIF_SHORT[prev.verification]} → ${VERIF_SHORT[today.verification]}` });
  if (prev.hasEvent === false && today.hasEvent === true)
    out.push({ field: "trigger", text: "出现新的链级触发事件" });
  if (
    prev.confidenceRaw &&
    today.confidenceRaw &&
    ((prev.confidenceRaw === "low" && today.confidenceRaw === "high") ||
      (prev.confidenceRaw === "high" && today.confidenceRaw === "low"))
  )
    out.push({ field: "confidence", text: `置信度明显${today.confidenceRaw === "high" ? "上升" : "下降"}` });
  return out;
}

// 读 beforeYmd 之前最近一个存档日的全部链 Judgment(slug → ChainJudgment)
export async function loadPrevJudgments(beforeYmd: string): Promise<Map<string, ChainJudgment>> {
  const out = new Map<string, ChainJudgment>();
  const db = getPrisma();
  if (!db) return out;
  const prevDay = await db.dailyJudgment
    .findFirst({ where: { ymd: { lt: beforeYmd } }, orderBy: { ymd: "desc" }, select: { ymd: true } })
    .catch(() => null);
  if (!prevDay) return out;
  const rows = await db.dailyJudgment
    .findMany({ where: { ymd: prevDay.ymd } })
    .catch(() => []);
  for (const r of rows) {
    const data = r.data as unknown as ChainJudgment;
    if (data?.chainSlug) out.set(r.subject, data);
  }
  return out;
}

// ---- 「StockTell 今天怎么看」总判断(首页阅读路径改版 2026-08-14):把全部链级判断
// 压成 一句总判断 + 最值得看/最大变化/最大风险 三行——用户进来不再自己拼。纯模板合成。
import { INTENT_PHRASE, LOGIC_CHIP } from "@/lib/judgment";
import { INTENT_SEVERITY } from "@/lib/market-intent/ui";
import type { IntentType } from "@/lib/market-intent/types";

export interface DailyTell {
  sentence: string; // 一句总判断
  best: string; // 最值得看
  biggestChange: string | null; // 最大变化(无=与昨日无方向性变化)
  biggestRisk: string | null; // 最大风险(无资金风险信号时为 null)
}

const RISK_SET: IntentType[] = ["exit", "distribution", "exhaustion"];

export function composeDailyTell(
  judgments: (ChainJudgment & { changes?: JudgmentChange[] })[]
): DailyTell | null {
  if (judgments.length === 0) return null;
  const top = judgments.slice(0, 3);
  const part = (j: ChainJudgment) => `${j.chainName}${LOGIC_CHIP[j.logic]},${INTENT_PHRASE[j.intent]}`;
  let sentence = `今天${part(top[0])}`;
  if (top[0].splitNote) sentence += `(${top[0].splitNote.replace(/^链内分化:/, "").replace(/。$/, "")})`;
  for (const j of top.slice(1)) sentence += `;${part(j)}`;
  sentence += "。";

  const changed = judgments
    .filter((j) => (j.changes ?? []).some((c) => c.field === "intent"))
    .sort((a, b) => INTENT_SEVERITY[a.intent] - INTENT_SEVERITY[b.intent])[0];
  const intentChange = changed?.changes?.find((c) => c.field === "intent");
  const risky = judgments
    .filter((j) => RISK_SET.includes(j.intent))
    .sort((a, b) => INTENT_SEVERITY[a.intent] - INTENT_SEVERITY[b.intent])[0];

  return {
    sentence,
    best: top[0].chainName,
    biggestChange: changed && intentChange ? `${changed.chainName} ${intentChange.text.replace(/^资金意图 /, "")}` : null,
    biggestRisk: risky ? `${risky.chainName}资金${risky.intentLabel}` : null,
  };
}

// 今日 Judgment 附加变化 + 按变化重排(有变化的链信息量更高,rank 每项 +3 后重排;
// 首屏 top3 因此自动把「变了的」顶上去——这正是 Change Detection 的产品意义)
export async function attachChanges(
  ymd: string,
  judgments: ChainJudgment[]
): Promise<{ judgments: (ChainJudgment & { changes: JudgmentChange[] })[]; hadPrev: boolean }> {
  const prev = await loadPrevJudgments(ymd).catch(() => new Map<string, ChainJudgment>());
  const withChanges = judgments.map((j) => ({
    ...j,
    changes: computeJudgmentChanges(prev.get(j.chainSlug), j),
  }));
  withChanges.sort((a, b) => b.rank + b.changes.length * 3 - (a.rank + a.changes.length * 3));
  return { judgments: withChanges, hadPrev: prev.size > 0 };
}
