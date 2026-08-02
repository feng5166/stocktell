// insight 管线 · 事件专篇(M2,PRD docs/prd-2.3-iteration-review.md §2)。
// 设计:最大化复用 daily 管线——事件专篇 = 「itemsOverride 限定为事件自己的条目」的
// generateDailyInsight 产物 + eventMeta 标识。触发/判断/热力/映射/风险/references/hops
// 全部走既有五段生成与四道护栏,零新散文通道;标题为规则模板(非 LLM),仍进 ourProse 扫描。
// 触发线 = M1 PRD 拍板 D3:|隔夜|≥5% 或 同链 ≥3 触发共振;数值配置化(env)。
// 审核 = 全审(D2 口径延伸):事件专篇含新映射概率高,不走 daily 的自动发布轨。
import type { BriefingItem } from "@/lib/briefings";
import { CHAINS, getChain, type ChainConfig } from "@/data/chains";
import { resolvePrimary, resolveInChain } from "@/lib/relation-resolver";
import { chainIdFromSlug } from "@/lib/relation-rank";
import { generateDailyInsight, type GenerateResult } from "./generate";
import type { EventMeta } from "./schema";

// 触发阈值(D3,配置化)。EVT_TRIGGER_ABS=隔夜绝对涨跌%;EVT_TRIGGER_RESONANCE=同链触发数;
// EVT_DAILY_CAP=每日专篇上限(预期频率每周 1-3 篇,cap 防大波动日刷屏审核队列)。
const num = (v: string | undefined, d: number) => {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : d;
};
export const EVT_TRIGGER_ABS = () => num(process.env.EVT_TRIGGER_ABS, 5);
export const EVT_TRIGGER_RESONANCE = () => num(process.env.EVT_TRIGGER_RESONANCE, 3);
export const EVT_DAILY_CAP = () => num(process.env.EVT_DAILY_CAP, 2);

export type EventCandidate = {
  meta: EventMeta;
  slug: string; // evt-{date}-{code} | evt-{date}-res-{chainId}
  chain: ChainConfig; // 归属链(注册表 ChainConfig,segments 已配置)
  items: BriefingItem[]; // 喂给生成器的条目子集
  score: number; // 排序用(big_move=|涨跌|,resonance=触发数)
};

// slug 片段只允许 [a-z0-9-](触发代码可能含 "." 如 BRK.B / 港股数字)
const slugify = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
export const eventSlug = (date: string, triggerCode: string) => `evt-${date}-${slugify(triggerCode)}`;
export const resonanceSlug = (date: string, chainId: string) => `evt-${date}-res-${slugify(chainId)}`;

// 归属链:触发源主关系链(关系模型 id)→ 注册表里 insightSlug 对得上的已配置链。
// 找不到(触发源无关系档/链未配置 segments)→ null,该候选放弃(不硬挂错链)。
function ownerChainOf(relChainId: string | undefined | null): ChainConfig | null {
  if (!relChainId) return null;
  const chain = Object.values(CHAINS).find(
    (c) => c.segments?.length && chainIdFromSlug(c.insightSlug) === relChainId
  );
  return chain ?? null;
}

// 条目是否归属某关系链(与 generate.ts chainOwnItems 同规则:触发源主链命中,或受益股在链内有档)
function itemBelongs(it: BriefingItem, relChainId: string): boolean {
  return (
    (!!it.triggerCode && resolvePrimary(it.triggerCode)?.chainId === relChainId) ||
    it.beneficiaries.some((b) => !!resolveInChain(b.code, relChainId))
  );
}

// D3 触发检测:当日已发布条目 → 事件候选(去重、按 score 排序、cap 截断)。
// big_move 优先(单事件叙事最强);resonance 兜共振日。同一触发标的同日只出一篇。
export function detectEventCandidates(items: BriefingItem[], date: string): EventCandidate[] {
  const abs = EVT_TRIGGER_ABS();
  const resonance = EVT_TRIGGER_RESONANCE();
  const out: EventCandidate[] = [];

  // ① big_move:|隔夜|≥阈值 的触发标的,一标的一篇(条目=该标的当日全部条目)
  const byCode = new Map<string, BriefingItem[]>();
  for (const it of items) {
    if (!it.triggerCode || it.triggerChange == null) continue;
    if (Math.abs(it.triggerChange) < abs) continue;
    const arr = byCode.get(it.triggerCode) ?? [];
    arr.push(it);
    byCode.set(it.triggerCode, arr);
  }
  for (const [code, evItems] of Array.from(byCode)) {
    const first = evItems[0];
    const chain = ownerChainOf(resolvePrimary(code)?.chainId);
    if (!chain) continue;
    const chg = first.triggerChange ?? 0;
    const name = first.triggerName ?? code;
    out.push({
      slug: eventSlug(date, code),
      chain,
      items: evItems,
      score: Math.abs(chg),
      meta: {
        kind: "big_move",
        triggerCode: code,
        triggerName: name,
        // 标题=规则模板(不进 LLM);「大涨/大跌」为事实描述、不在禁词表,不带具体数字
        title: `${name} 隔夜${chg >= 0 ? "大涨" : "大跌"}:会传到 A 股哪些环节?`,
        itemIds: evItems.map((it) => it.id),
      },
    });
  }

  // ② resonance:同一关系链 ≥N 个【不同触发标的】共振(已出 big_move 的链不重复出共振篇)
  const bigMoveChains = new Set(out.map((c) => c.chain.id));
  for (const chain of Object.values(CHAINS).filter((c) => c.segments?.length)) {
    if (bigMoveChains.has(chain.id)) continue;
    const relChainId = chainIdFromSlug(chain.insightSlug) ?? chain.id;
    const own = items.filter((it) => itemBelongs(it, relChainId));
    const codes = new Set(own.map((it) => it.triggerCode).filter(Boolean));
    if (codes.size < resonance) continue;
    out.push({
      slug: resonanceSlug(date, chain.id),
      chain,
      items: own,
      score: codes.size,
      meta: {
        kind: "resonance",
        title: `${chain.name}隔夜多点共振:${codes.size} 个触发源怎么传导?`,
        itemIds: own.map((it) => it.id),
      },
    });
  }

  // big_move 按幅度、resonance 按触发数;big_move 整体优先(排序键:类型权重+score)
  out.sort((a, b) => {
    const w = (c: EventCandidate) => (c.meta.kind === "big_move" ? 1000 : 0) + c.score;
    return w(b) - w(a);
  });
  return out.slice(0, EVT_DAILY_CAP());
}

// 生成事件专篇 payload:走 daily 五段生成(itemsOverride=事件条目,eventFocus 调焦判断段),
// 产物挂 eventMeta。guard 由 generateDailyInsight 内部跑(含 eventMeta.title 扫描——
// 注意:runGuards 在 payload 挂 eventMeta 之前执行,标题为规则模板且不含数字/禁词,
// cron 侧发布前仍有 complianceBlockers 复检兜底(含 eventMeta 后的完整 payload)。
export async function generateEventInsight(
  cand: EventCandidate,
  date: string
): Promise<GenerateResult> {
  const chain = getChain(cand.chain.id);
  if (!chain) return { ok: false, reason: "链未配置" };
  const r = await generateDailyInsight(chain.id, date, {
    itemsOverride: cand.items,
    eventFocus:
      cand.meta.kind === "big_move"
        ? { code: cand.meta.triggerCode!, name: cand.meta.triggerName ?? cand.meta.triggerCode! }
        : undefined,
  });
  if (r.ok && r.payload) r.payload.eventMeta = cand.meta;
  return r;
}
