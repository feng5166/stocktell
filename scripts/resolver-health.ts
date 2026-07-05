// P1 resolver 观察期健康检查(负责人 2026-07-04 定 2 交易日观察期)。只读、不改任何生产代码。
// 覆盖观察清单里【能静态查】的项:unknown relationType/segment、empty/duplicate relation、
// 证据队列干净、daily 未污染 static、消费方 map 构建正常。运行:npx tsx scripts/resolver-health.ts
// (运行时项——resolver fallback / cache miss / 生产日志——需生产监控,不在此脚本。)
import { allRelations, chainList } from "../src/data/chain-relations";
import { resolvePrimary, resolveRelationsForCode, getDailySignals } from "../src/lib/relation-resolver";
import { buildWatchChainMap } from "../src/lib/watch-relation";
import { STOCKS } from "../src/data/stocks";

const REL_ENUM = new Set(["trigger", "direct", "indirect", "sentiment", "weak", "candidate"]);
const R = allRelations();
let fails = 0;
const check = (name: string, ok: boolean, detail = "") => {
  console.log(`  ${ok ? "✓" : "✗"} ${name}${detail ? " — " + detail : ""}`);
  if (!ok) fails++;
};

console.log("=== P1 resolver 健康检查 ===");

// 1. 无 unknown relationType
const badRT = R.filter((r) => !REL_ENUM.has(r.relationType));
check("无 unknown relationType", badRT.length === 0, badRT.map((r) => `${r.code}=${r.relationType}`).join(","));

// 2. 无 empty segment
const badSeg = R.filter((r) => !r.segmentName || !r.segmentId);
check("无 empty segment", badSeg.length === 0, badSeg.map((r) => r.code).join(","));

// 3. 无 empty relation(reason / verificationPoints)
check("无 empty reason", R.every((r) => r.reason?.trim()), R.filter((r) => !r.reason?.trim()).map((r) => r.code).join(","));
check("无 empty verificationPoints", R.every((r) => r.verificationPoints?.length > 0), R.filter((r) => !r.verificationPoints?.length).map((r) => r.code).join(","));

// 4. 无 duplicate(code|chainId 唯一)
const seen = new Set<string>();
const dups: string[] = [];
for (const r of R) {
  const k = `${r.code}|${r.chainId}`;
  if (seen.has(k)) dups.push(k);
  seen.add(k);
}
check("无 duplicate relation", dups.length === 0, dups.join(","));

// 5. 证据队列干净(direct 红 / indirect 黄 应=0)
const noRefs = (r: (typeof R)[number]) => !r.references || r.references.length === 0;
const weakEv = (r: (typeof R)[number]) => !r.evidenceStatus || r.evidenceStatus === "needs_review" || r.evidenceStatus === "manual_only";
const CONCEPT = /受益|机会|龙头|弹性|空间|景气/;
const VERIFY = /后续看|验证|订单|客户|收入|毛利|占比|交付|披露|财报|供货|营收/;
const conceptGap = (r: (typeof R)[number]) => r.relationType !== "trigger" && CONCEPT.test(r.reason) && !VERIFY.test(r.reason);
const directRed = R.filter((r) => r.relationType === "direct" && (weakEv(r) || noRefs(r) || conceptGap(r)));
const indirectYellow = R.filter((r) => r.relationType === "indirect" && (weakEv(r) || noRefs(r) || conceptGap(r)));
check("direct 缺证据队列 = 0", directRed.length === 0, directRed.map((r) => r.code).join(","));
check("indirect 缺证据队列 = 0", indirectYellow.length === 0, indirectYellow.map((r) => r.code).join(","));
check("trigger 全分组", R.filter((r) => r.relationType === "trigger" && !r.triggerGroup).length === 0);

// 6. daily 未污染 static(getDailySignals 空 + resolver 输出全 static)
check("dailyRelationSignals 空(未污染 static)", getDailySignals("2026-07-04").length === 0);
const codes = Array.from(new Set(R.map((r) => r.code)));
const nonStatic = codes.map((c) => resolvePrimary(c)).filter((p) => p && p.resolvedSource !== "static");
check("resolver 输出全 static(无 daily 自动升降级)", nonStatic.length === 0);

// 7. 消费方 map 构建正常(watchlist / stocks / track 字段无 undefined)
let watchOk = true;
try {
  const wm = buildWatchChainMap();
  watchOk = Object.values(wm).every((w) => w.chainId && w.relation && w.segment);
} catch {
  watchOk = false;
}
check("watchlist map 构建正常", watchOk);

let stocksOk = true;
try {
  for (const s of STOCKS) {
    const rels = resolveRelationsForCode(s.code);
    if (rels.length && !resolvePrimary(s.code)) stocksOk = false;
  }
} catch {
  stocksOk = false;
}
check("/stocks map 构建正常", stocksOk);

// track 预埋字段:resolvePrimary 每个 code 不抛(chainId/segmentId/relationType 无 undefined 泄漏)
let trackOk = true;
try {
  for (const c of codes) {
    const p = resolvePrimary(c);
    if (p && (!p.chainId || !p.segmentId || !p.relationType)) trackOk = false;
  }
} catch {
  trackOk = false;
}
check("track 预埋字段无 undefined", trackOk);

console.log(`\n关系总数 ${R.length} · 链 ${chainList().length} · direct ${R.filter((r) => r.relationType === "direct").length} · indirect ${R.filter((r) => r.relationType === "indirect").length} · trigger ${R.filter((r) => r.relationType === "trigger").length}`);
console.log(fails === 0 ? "✅ 全部通过 — resolver 底座静态健康" : `✗ ${fails} 项异常 — 需处理`);
process.exit(fails === 0 ? 0 : 1);
