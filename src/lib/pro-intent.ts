// Pro 意向 v2(PRD prd-trust-chat-pro-intent §6,PR5)。
// 单一来源:候选能力/使用场景的稳定枚举 key + 中文标签——客户端表单、/api/feedback 白名单校验、
// admin/metrics 聚合三方共用,防"客户端自由文本 → 聚合口径漂移"。
// 纪律:不问价格、不建 plan 字段、不出现"立即订阅";只验证能力需求,不验证价格与支付。

export const PRO_INTENT_CHOICES = {
  watchlist_tracking: "自选股相关事件的深度追踪",
  chain_daily_alert: "产业链每日变化提醒",
  longer_review: "更长周期、按链拆分的历史复盘",
  more_chains: "更多产业链覆盖",
  verify_tracking: "个股验证点持续跟踪",
  more_chat_quota: "更多情境追问额度",
  other: "其他",
} as const;
export type ProIntentChoice = keyof typeof PRO_INTENT_CHOICES;

export const PRO_USE_CASES = {
  preopen: "盘前看隔夜传导",
  intraday: "盘中看懂异动",
  postclose: "盘后复盘",
  research: "研究自选与全球事件的关系",
} as const;
export type ProUseCase = keyof typeof PRO_USE_CASES;

export const PRO_INTENT_CATEGORY = "pro_intent_v2"; // feedback 表 category(只能经服务端结构化路径写入)
export const PRO_INTENT_MAX_CHOICES = 2;
export const PRO_INTENT_OTHER_MAX = 100;

export type ProIntentPayload = {
  choices: ProIntentChoice[]; // 1~2 项
  useCase: ProUseCase;
  other?: string; // 选了 other 时的自由文本(≤100 字;只落 DB,不进 Umami)
};

// 服务端白名单解析:枚举外值丢弃;不合法(0 选择/无场景)返回 null → 400。
// review P2:不能用 `in`——原型链键("toString"/"constructor")会通过 `k in obj`,
// 伪造 choices 可携带垃圾键进聚合;必须 hasOwnProperty。同时去重(["other","other"] 只算一项)。
const isChoice = (c: unknown): c is ProIntentChoice =>
  typeof c === "string" && Object.prototype.hasOwnProperty.call(PRO_INTENT_CHOICES, c);
const isUseCase = (u: unknown): u is ProUseCase =>
  typeof u === "string" && Object.prototype.hasOwnProperty.call(PRO_USE_CASES, u);
export function parseProIntent(raw: unknown): ProIntentPayload | null {
  const it = (raw ?? {}) as Partial<{ choices: unknown; useCase: unknown; other: unknown }>;
  const choices = Array.from(
    new Set((Array.isArray(it.choices) ? it.choices : []).filter(isChoice))
  ).slice(0, PRO_INTENT_MAX_CHOICES);
  const useCase = isUseCase(it.useCase) ? it.useCase : null;
  if (choices.length < 1 || !useCase) return null;
  const other = String(it.other ?? "").trim().slice(0, PRO_INTENT_OTHER_MAX);
  return { choices, useCase, ...(other && choices.includes("other") ? { other } : {}) };
}

// 稳定序列化(feedback.content):固定键序 JSON,聚合端 JSON.parse 即得枚举。
export function serializeProIntent(p: ProIntentPayload): string {
  return JSON.stringify({ v: 2, choices: p.choices, useCase: p.useCase, ...(p.other ? { other: p.other } : {}) });
}

// 飞书/人读摘要
export function proIntentSummary(p: ProIntentPayload): string {
  const cs = p.choices.map((c) => PRO_INTENT_CHOICES[c]).join("、");
  return `想要:${cs};场景:${PRO_USE_CASES[p.useCase]}${p.other ? `;补充:${p.other}` : ""}`;
}
