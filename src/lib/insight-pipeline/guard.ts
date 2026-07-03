// insight 管线 · 护栏(PRD §7.1 + 增补#4:阻断型/警告型两级)。
// 阻断型(blockers 非空):弃 + 飞书告警,不进审核队列。
// 警告型(warnings):照常进审,审核页与飞书标注。
import { hasSpecificMove } from "@/lib/generate";
import type { ChainSegment } from "@/data/chains";
import { validateDailyPayload, type DailyInsightPayload } from "./schema";

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

// 禁词全集(PRD §9.2 + 盘面词);产业语义白名单先行剥离再扫描
const INDUSTRIAL_WHITELIST = /出货量|放量节奏|订单放量|业务放量|产品放量|真正放量|批量出货|出货节奏/g;
const BANNED =
  /买入|卖出|建议买|抄底|满仓|加仓|清仓|减仓|低吸|接飞刀|站岗|目标价|建议参与|短线机会|回调关注|等回调|上车|别急着接|往里冲|追高|追涨|追板|低开|高开|企稳|放量|缩量|破位|补跌|超跌反弹|止跌|杀跌|洗盘|获利盘|兑现盘|错杀|出货|值得多看一眼|开盘盯|盘中盯/g;

export function scanBannedWords(text: string): string[] {
  const cleaned = text.replace(INDUSTRIAL_WHITELIST, "");
  const hits = cleaned.match(BANNED) ?? [];
  return Array.from(new Set(hits));
}

// 我们生成的散文(数字红线 + 禁词都扫这部分)
function ourProse(p: DailyInsightPayload): string {
  return [
    p.trigger.summary,
    p.judgment,
    ...p.heat.map((h) => h.reason),
    ...p.mappingsDelta.flatMap((m) => [m.todayWhy, ...m.verify]),
    p.risk,
    ...p.references.map((r) => r.supports), // supports 是我们写的,name 是外部标题
  ].join("\n");
}

// 外部来源标题:只做禁词扫描,不做数字红线(真实新闻标题可能含「Q3 营收增 20%」等合法数字)
function externalText(p: DailyInsightPayload): string {
  return p.references.map((r) => r.name).join("\n");
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
