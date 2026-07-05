// 新增关系准入 lint(负责人 2026-07-04 观察期拍板 #4:长期防腐,防关系库退化)。
// 规则:direct 必须 references + verificationPoints;indirect 至少 references 或 evidenceStatus;
// trigger 必须 triggerGroup;candidate 必须 candStatus(reviewStatus,现无字段→暂跳,待层③落地);
// reason 不得含交易化词;reason 不得只写"龙头/受益/弹性/机会/景气"等概念词而无验证点;segment 必须在 registry。
// 运行:npx tsx scripts/relation-lint.ts(CI/回灌前跑,有违规非零退出)。
import { allRelations, type StockChainRelation } from "@/data/chain-relations";
import { isKnownSegment } from "@/data/segment-registry";

// 交易化喊单词(窄表:真买卖/仓位/目标价指令)。不含"出货/放量"等产业术语(那些是供应链/量能词,非喊单)。
const TRADE_WORDS = /买入|卖出|加仓|减仓|建仓|补仓|清仓|满仓|空仓|重仓|抄底|逃顶|止损|止盈|打板|上车|梭哈|接盘|目标价|涨停|跌停|必涨|翻倍/;

export type LintViolation = {
  code: string;
  name: string;
  chainId: string;
  relationType: string;
  rule: string;
  detail?: string;
};

const CONCEPT = /受益|机会|龙头|弹性|空间|景气/;
const VERIFY = /后续看|验证|订单|客户|收入|毛利|占比|交付|披露|财报|供货|营收/;
const hasRefs = (r: StockChainRelation) => !!r.references && r.references.length > 0;
const hasEv = (r: StockChainRelation) => !!r.evidenceStatus && r.evidenceStatus !== "needs_review" && r.evidenceStatus !== "manual_only";

export function lintRelations(rels: StockChainRelation[] = allRelations()): LintViolation[] {
  const V: LintViolation[] = [];
  const push = (r: StockChainRelation, rule: string, detail?: string) =>
    V.push({ code: r.code, name: r.name, chainId: r.chainId, relationType: r.relationType, rule, detail });

  for (const r of rels) {
    // segment 在册
    if (!isKnownSegment(r.chainId, r.segmentName)) push(r, "unknown-segment", r.segmentName);
    // direct
    if (r.relationType === "direct") {
      if (!hasRefs(r)) push(r, "direct-no-references");
      if (!r.verificationPoints?.length) push(r, "direct-no-verificationPoints");
    }
    // indirect:至少 references 或 evidenceStatus
    if (r.relationType === "indirect" && !hasRefs(r) && !hasEv(r)) push(r, "indirect-no-evidence");
    // trigger 分组
    if (r.relationType === "trigger" && !r.triggerGroup) push(r, "trigger-no-group");
    // reason 交易化喊单词(窄表)
    const trade = r.reason.match(TRADE_WORDS);
    if (trade) push(r, "reason-trade-word", trade[0]);
    // reason 概念词无验证点(trigger 是海外定位,不算)
    if (r.relationType !== "trigger" && CONCEPT.test(r.reason) && !VERIFY.test(r.reason)) push(r, "reason-concept-only");
    // reason 过短
    if (r.relationType !== "trigger" && r.reason.trim().length < 20) push(r, "reason-too-short");
  }
  return V;
}
