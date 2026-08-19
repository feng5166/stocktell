// Change Detection(2.2.6,负责人拍板):用户不关心「当前是什么」,关心「今天有什么是
// 昨天不知道的」。只主动突出真变化:intent 改/产业逻辑改/验证改/出现新 trigger/
// confidence 明显变化;没变化就一句「与昨日相比没有方向性变化」,绝不硬生成。
// computeJudgmentChanges 是纯函数(fixture 可断言防漂移);loadPrevJudgments 读存档。
import { getPrisma } from "@/lib/prisma";
import type { ChainJudgment, IndustryLogic, VerificationState } from "@/lib/judgment";

export interface JudgmentChange {
  field: "intent" | "logic" | "verification" | "trigger" | "confidence";
  text: string; // 人话:「资金意图 分歧 → 派发特征」(纯文本口径,总判断/分享卡/存档都用它)
  // 拆开的三段(2026-08-18 视觉校准):首页要把「标签」渲染成灰、只给「新状态」上状态色,
  // 整句刷成品牌紫是上一版最刺眼的问题。没有 from→to 的项(如 trigger)只有 label。
  label: string; // 「资金意图」/「产业逻辑」/「验证」…
  from?: string; // 昨日态
  to?: string; // 今日态
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
    out.push({
      field: "intent",
      text: `资金意图 ${prev.intentLabel} → ${today.intentLabel}`,
      label: "资金意图",
      from: prev.intentLabel,
      to: today.intentLabel,
    });
  if (prev.logic !== today.logic)
    out.push({
      field: "logic",
      text: `产业逻辑 ${LOGIC_SHORT[prev.logic]} → ${LOGIC_SHORT[today.logic]}`,
      label: "产业逻辑",
      from: LOGIC_SHORT[prev.logic],
      to: LOGIC_SHORT[today.logic],
    });
  if (prev.verification !== today.verification)
    out.push({
      field: "verification",
      text: `验证 ${VERIF_SHORT[prev.verification]} → ${VERIF_SHORT[today.verification]}`,
      label: "验证",
      from: VERIF_SHORT[prev.verification],
      to: VERIF_SHORT[today.verification],
    });
  if (prev.hasEvent === false && today.hasEvent === true)
    out.push({ field: "trigger", text: "出现新的链级触发事件", label: "出现新的链级触发事件" });
  if (
    prev.confidenceRaw &&
    today.confidenceRaw &&
    ((prev.confidenceRaw === "low" && today.confidenceRaw === "high") ||
      (prev.confidenceRaw === "high" && today.confidenceRaw === "low"))
  )
    out.push({
      field: "confidence",
      text: `置信度明显${today.confidenceRaw === "high" ? "上升" : "下降"}`,
      label: "置信度",
      to: `明显${today.confidenceRaw === "high" ? "上升" : "下降"}`,
    });
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
  // 同意图的链合并成一个从句(2026-08-14 三轮走查:三条链两条衰竭,逐链罗列=同一句话
  // 念三遍,总判断读起来像机器;合并后「AI 应用、AI 算力资金动能在衰竭」一遍说完)
  const groups: { intent: IntentType; js: ChainJudgment[] }[] = [];
  for (const j of judgments.slice(0, 4)) {
    const g = groups.find((x) => x.intent === j.intent);
    if (g) g.js.push(j);
    else groups.push({ intent: j.intent, js: [j] });
  }
  const clause = (g: (typeof groups)[number]) => {
    const names = g.js.map((j) => j.chainName).join("、");
    if (g.js.length === 1 && g.js[0].logic !== "unchanged") {
      return `${names}${LOGIC_CHIP[g.js[0].logic]},${INTENT_PHRASE[g.js[0].intent]}`;
    }
    return `${names}${INTENT_PHRASE[g.intent]}`;
  };
  let sentence = `今天,${groups.slice(0, 3).map(clause).join(";")}`;
  if (top[0].splitNote)
    sentence += `(${top[0].splitNote.replace(/^链内分化:/, "").replace(/。$/, "")})`;
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
    // 短标签态(DailyTell 底部 3 chip):去空格紧凑箭头;完整表述在卡片与链页
    biggestChange:
      changed && intentChange
        ? `${changed.chainName} ${intentChange.text.replace(/^资金意图 /, "").replace(/ → /g, "→")}`
        : null,
    biggestRisk: risky ? `${risky.chainName}·${risky.intentLabel}` : null,
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
