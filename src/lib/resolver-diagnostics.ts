// P1 resolver 诊断(观察期 #1 健康面板 + CLI 共享逻辑,单一真源)。只读、不改生产数据。
// 覆盖观察清单可静态查项;运行时项(fallback 命中 / cache miss / 生产日志)= null,需生产监控。
import { allRelations, chainList, type StockChainRelation } from "@/data/chain-relations";
import { resolvePrimary, getDailySignals, getReviewQueue } from "@/lib/relation-resolver";
import { isKnownSegment } from "@/data/segment-registry";
import { lintRelations, type LintViolation } from "@/lib/relation-lint";

export type HealthCheck = { name: string; ok: boolean; detail: string };
export type Diagnostics = {
  total: number;
  chains: number;
  byType: Record<string, number>;
  metrics: {
    unknownRelationType: number;
    unknownSegment: number;
    emptyRelation: number;
    duplicate: number;
    dailyCoverStaticNoChange: number; // daily 覆盖 static 但未改档(层②落地前恒 0)
    reviewQueueNew: number; // reviewQueue 新增(层③落地前恒 0)
    fallbackHits: number | null; // 运行时,null=需生产监控
    nonStaticResolve: number; // resolver 输出非 static(=daily 自动升降级,应 0)
  };
  checks: HealthCheck[];
  lint: LintViolation[];
  passed: boolean;
};

const REL_ENUM = new Set(["trigger", "direct", "indirect", "sentiment", "weak", "candidate"]);
const noRefs = (r: StockChainRelation) => !r.references || r.references.length === 0;
const weakEv = (r: StockChainRelation) => !r.evidenceStatus || r.evidenceStatus === "needs_review" || r.evidenceStatus === "manual_only";
const CONCEPT = /受益|机会|龙头|弹性|空间|景气/;
const VERIFY = /后续看|验证|订单|客户|收入|毛利|占比|交付|披露|财报|供货|营收/;
const conceptGap = (r: StockChainRelation) => r.relationType !== "trigger" && CONCEPT.test(r.reason) && !VERIFY.test(r.reason);

export function runDiagnostics(date = "2026-07-04"): Diagnostics {
  const R = allRelations();
  const byType: Record<string, number> = {};
  for (const r of R) byType[r.relationType] = (byType[r.relationType] ?? 0) + 1;

  const unknownRT = R.filter((r) => !REL_ENUM.has(r.relationType));
  const unknownSeg = R.filter((r) => !isKnownSegment(r.chainId, r.segmentName));
  const emptyRel = R.filter((r) => !r.reason?.trim() || !(r.verificationPoints?.length > 0) || !r.segmentName);
  const seen = new Set<string>();
  const dups: string[] = [];
  for (const r of R) {
    const k = `${r.code}|${r.chainId}`;
    if (seen.has(k)) dups.push(k);
    seen.add(k);
  }
  const codes = Array.from(new Set(R.map((r) => r.code)));
  const nonStatic = codes.map((c) => resolvePrimary(c)).filter((p) => p && p.resolvedSource !== "static");
  const directRed = R.filter((r) => r.relationType === "direct" && (weakEv(r) || noRefs(r) || conceptGap(r)));
  const indirectYellow = R.filter((r) => r.relationType === "indirect" && (weakEv(r) || noRefs(r) || conceptGap(r)));
  const triggerUngrouped = R.filter((r) => r.relationType === "trigger" && !r.triggerGroup);
  const lint = lintRelations(R);

  // P1-5(2026-07-06 恒绿修):加能【真失败】的检查,让 health 不再结构性恒绿。
  const KNOWN_CHAINS = new Set(["ai-infra", "data-center-power", "ai-application", "semiconductor-equipment"]); // 2.2-B 扩链
  const unknownChain = R.filter((r) => !KNOWN_CHAINS.has(r.chainId));
  // 多链串档:同 code 出现在多条链(P1-3 后应 0;>0 = resolvePrimary 跨链取最强档会串档误导)
  const codeChains = new Map<string, Set<string>>();
  for (const r of R) {
    const s = codeChains.get(r.code) ?? new Set<string>();
    s.add(r.chainId);
    codeChains.set(r.code, s);
  }
  const multiChain = Array.from(codeChains.entries()).filter(([, s]) => s.size > 1).map(([c]) => c);
  // P1-3 remove 验证:电力/AI应用 code 不得被 ai-infra 旧源捞回
  const REMOVE_FROM_AI_INFRA = ["002837", "300693", "002518", "600875", "688111", "300033", "002230", "300418", "601360", "300496"];
  const removeLeak = REMOVE_FROM_AI_INFRA.filter((c) => R.some((r) => r.code === c && r.chainId === "ai-infra"));

  const checks: HealthCheck[] = [
    { name: "无 unknown relationType", ok: unknownRT.length === 0, detail: unknownRT.map((r) => r.code).join(",") },
    { name: "无 unknown chain", ok: unknownChain.length === 0, detail: unknownChain.map((r) => `${r.code}:${r.chainId}`).join(",") },
    { name: "无 unknown segment", ok: unknownSeg.length === 0, detail: unknownSeg.map((r) => `${r.code}:${r.segmentName}`).join(",") },
    { name: "无多链串档(同 code 单链,防 resolvePrimary 跨链取最强档)", ok: multiChain.length === 0, detail: multiChain.join(",") },
    { name: "P1-3 remove 未被旧源捞回(电力/AI应用不在 ai-infra)", ok: removeLeak.length === 0, detail: removeLeak.join(",") },
    { name: "无 empty relation", ok: emptyRel.length === 0, detail: emptyRel.map((r) => r.code).join(",") },
    { name: "无 duplicate relation", ok: dups.length === 0, detail: dups.join(",") },
    { name: "direct 缺证据队列 = 0", ok: directRed.length === 0, detail: directRed.map((r) => r.code).join(",") },
    { name: "indirect 缺证据队列 = 0", ok: indirectYellow.length === 0, detail: indirectYellow.map((r) => r.code).join(",") },
    { name: "trigger 全分组", ok: triggerUngrouped.length === 0, detail: triggerUngrouped.map((r) => r.code).join(",") },
    { name: "关系准入 lint 全过", ok: lint.length === 0, detail: `${lint.length} 处违规` },
    // ⚠️ 骨架期占位(daily 层未落地,以下两项恒真、非活跃保证;daily 落地后才是真检查):
    { name: "[占位] dailyRelationSignals 空", ok: getDailySignals(date).length === 0, detail: "骨架期占位·非活跃保证" },
    { name: "[占位] resolver 输出全 static", ok: nonStatic.length === 0, detail: "骨架期占位·非活跃保证" },
  ];

  return {
    total: R.length,
    chains: chainList().length,
    byType,
    metrics: {
      unknownRelationType: unknownRT.length,
      unknownSegment: unknownSeg.length,
      emptyRelation: emptyRel.length,
      duplicate: dups.length,
      dailyCoverStaticNoChange: 0,
      reviewQueueNew: getReviewQueue().length,
      fallbackHits: null,
      nonStaticResolve: nonStatic.length,
    },
    checks,
    lint,
    passed: checks.every((c) => c.ok),
  };
}
