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
