// insight 管线 · 护栏(PRD §7.1 + 增补#4:阻断型/警告型两级)。
// 阻断型(blockers 非空):弃 + 飞书告警,不进审核队列。
// 警告型(warnings):照常进审,审核页与飞书标注。
import { hasSpecificMove, scanBannedWords } from "@/lib/content-guard";
import type { ChainSegment } from "@/data/chains";
import { validateDailyPayload, isRefV2, type DailyInsightPayload } from "./schema";

export { scanBannedWords }; // 兼容既有从 guard 引用的位置

export interface GuardResult {
  blockers: string[];
  warnings: string[];
  detail: {
    schemaErrors: string[];
    bannedHits: string[];
    numberHits: boolean;
    refsTotal: number;
    refsVerified: number;
    llmCalls: number;
    searchCalls: number;
    retries: number;
  };
}

// 禁词 / 数字检查统一走 content-guard(单一来源,含全角/中文数字与产业白名单)

// 我们生成的散文(数字红线 + 禁词都扫这部分)
function ourProse(p: DailyInsightPayload): string {
  return [
    p.trigger.summary,
    p.judgment,
    ...p.heat.map((h) => h.reason),
    ...p.mappingsDelta.flatMap((m) => [m.todayWhy, ...m.verify]),
    p.risk,
    // supports/supportsText 是我们写的(v1/v2 双读),name 是外部标题
    ...p.references.map((r) => (isRefV2(r) ? r.supportsText : r.supports)),
  ].join("\n");
}

// 外部来源标题:只做禁词扫描,不做数字红线(真实新闻标题可能含「Q3 营收增 20%」等合法数字)
function externalText(p: DailyInsightPayload): string {
  return p.references.map((r) => r.name).join("\n");
}

// 发布/保存前的合规扫描(禁词 + 具体涨跌数字),供 admin 人审路径做代码级纵深:生成侧有
// runGuards 硬闸,人审侧也要兜——持 ADMIN_TOKEN 提交 judgment=「建议买入,涨了5%」不能绕过。
// 不含 schema / confidence 封顶(人审可给「高」),只查铁律③的禁词与涨跌数字红线。
export function complianceBlockers(payload: DailyInsightPayload): string[] {
  const b: string[] = [];
  const prose = ourProse(payload);
  const bannedHits = scanBannedWords(prose + "\n" + externalText(payload));
  if (bannedHits.length) b.push(`禁词命中:${bannedHits.join("、")}`);
  if (hasSpecificMove(prose)) b.push("命中具体涨跌数字红线");
  return b;
}

export function runGuards(
  payload: DailyInsightPayload,
  segments: ChainSegment[],
  meta: { llmCalls: number; searchCalls: number; retries: number }
): GuardResult {
  const blockers: string[] = [];
  const warnings: string[] = [];

  // 1. schema(含生成侧 confidence 封顶「中」红线)
  const schemaErrors = validateDailyPayload(payload, segments, { fromGenerator: true });
  if (schemaErrors.length) blockers.push(`schema 校验失败(${schemaErrors.length} 项)`);

  // 2. 禁词(我们的散文 + 外部标题都扫)
  const prose = ourProse(payload);
  const bannedHits = scanBannedWords(prose + "\n" + externalText(payload));
  if (bannedHits.length) blockers.push(`禁词命中:${bannedHits.join("、")}`);

  // 3. 具体涨跌数字红线:只扫我们生成的散文,不扫外部来源标题
  const numberHits = hasSpecificMove(prose);
  if (numberHits) blockers.push("命中具体涨跌数字红线");

  // 4. references 可达性(增补#4:警告型)
  const refsVerified = payload.references.filter((r) => r.verified).length;
  if (payload.references.length > 0 && refsVerified === 0)
    warnings.push("references 全部不可达(进审,请人工核链接)");

  return {
    blockers,
    warnings,
    detail: {
      schemaErrors,
      bannedHits,
      numberHits,
      refsTotal: payload.references.length,
      refsVerified,
      llmCalls: meta.llmCalls,
      searchCalls: meta.searchCalls,
      retries: meta.retries,
    },
  };
}
