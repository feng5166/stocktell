// Daily Judgment(2.2.5,负责人 2026-08-13 拍板):把 事件→关系→资金意图→验证 压缩成
// 「今天我到底该看什么」的几句话。不是再展示数据,是替用户做最后一次合成。
// v1 三输入组合模板句,不做评分:产业逻辑(增强/不变/减弱/主要是情绪)×资金行为(8 档意图)
// ×基本面验证(新验证/部分/无新证据/反证)→ 人话 headline + body + 「我怎么看」。
// 全部确定性规则+模板,零 LLM——同输入同输出,后续可 fixture 化防漂移。
// 判定按日存 daily_judgments(cron 写),为 2.2.6 Change Detection 的 yesterday→today diff 铺底。
import { Prisma } from "@prisma/client";
import { getPrisma } from "@/lib/prisma";
import { listBriefing, type BriefingItem } from "@/lib/briefings";
import { INSIGHT_CHAINS } from "@/data/insight-chains";
import { recentSnapshots } from "@/lib/market-intent/store";
import { INTENT_SEGMENTS, SEGMENT_BY_KEY } from "@/lib/market-intent/segments";
import { INTENT_SEVERITY, CONFIDENCE_LABEL } from "@/lib/market-intent/ui";
import { resolvePrimary, resolveInChain } from "@/lib/relation-resolver";
import { chainIdFromSlug } from "@/lib/relation-rank";
import type { IntentType, SegmentIntentSnapshot } from "@/lib/market-intent/types";

export type IndustryLogic = "strengthen" | "unchanged" | "weaken" | "sentiment";
export type VerificationState = "new" | "partial" | "none" | "contrary";

export interface ChainJudgment {
  ymd: string;
  chainSlug: string; // insight slug
  chainName: string; // 人话短名
  href: string;
  logic: IndustryLogic;
  intent: IntentType; // 主导板块意图(信息量最高)
  intentLabel: string;
  confidence: string; // 展示文案
  confidenceRaw?: "high" | "medium" | "low"; // 2.2.6 diff 用原始档(旧存档无此字段,diff 侧兼容)
  segmentName: string | null; // 主导板块名(链下多板块时)
  verification: VerificationState;
  hasEvent?: boolean; // 当日是否有链级触发事件(2.2.6「出现新 trigger」检测;旧存档无此字段)
  // —— 首页视觉优化(2026-08-14)展示字段:纯派生自现有静态数据,非新数据模型 ——
  logicLabel?: string; // 逻辑 chip 人话(逻辑增强/逻辑延续/逻辑承压/情绪偏热)
  coreSegments?: string[]; // 核心环节(链内意图板块名,信息量序 ≤3)
  repStocks?: string[]; // 代表映射(insight 核定 direct 优先 ≤3)
  verifyHint?: string; // 关键验证点(链级人话短语)
  headline: string;
  body: string;
  take: string; // 「我怎么看」
  splitNote: string | null; // 链内分化
  rank: number;
}

// 覆盖的链(与 Market Intent 板块归属一致);verifyHint = 该链当下最该等的验证口径(人话)
const CHAIN_DEFS: { slug: string; name: string; href: string; verifyHint: string }[] = [
  { slug: "ai-infra", name: "AI 算力", href: "/chain/ai#market-intent", verifyHint: "订单与云厂资本开支" },
  { slug: "datacenter-power", name: "数据中心电力", href: "/chain/data-center-power#market-intent", verifyHint: "液冷/电源订单" },
  { slug: "semiconductor-equipment", name: "半导体设备", href: "/chain/semiconductor-equipment#market-intent", verifyHint: "设备订单与晶圆厂招标" },
  { slug: "ai-application", name: "AI 应用", href: "/chain/ai#market-intent", verifyHint: "商业化收入与订单" },
];

const LOGIC_PHRASE: Record<IndustryLogic, string> = {
  strengthen: "逻辑在增强",
  unchanged: "逻辑没坏",
  weaken: "逻辑承压",
  sentiment: "仍以情绪映射为主",
};

// 逻辑 chip 短词(首页卡片用;句式版留给 headline)
export const LOGIC_CHIP: Record<IndustryLogic, string> = {
  strengthen: "逻辑增强",
  unchanged: "逻辑延续",
  weaken: "逻辑承压",
  sentiment: "情绪偏热",
};

export const INTENT_PHRASE: Record<IntentType, string> = {
  accumulation: "资金在提前进入",
  rush: "资金开始追",
  wash: "今天更像洗盘", // copylint-allow: Judgment 模板句,意图词结构化语境豁免(2026-08-13 拍板)
  distribution: "资金在高位换手",
  exit: "资金在撤",
  divergence: "资金分歧明显",
  exhaustion: "资金动能在衰竭",
  neutral: "资金没有明显动作",
};

const BULL: IntentType[] = ["accumulation", "rush"];
const BEAR: IntentType[] = ["distribution", "exit"];

// 「我怎么看」组合表(负责人给的范式句;命不中走 per-intent fallback)
function takeOf(logic: IndustryLogic, intent: IntentType, verification: VerificationState, verifyHint: string): string {
  const bull = BULL.includes(intent);
  const bear = BEAR.includes(intent);
  if (logic === "strengthen" && bull && (verification === "partial" || verification === "new"))
    return "事件、资金、基本面开始形成同向验证。";
  if (logic === "strengthen" && bull)
    return `产业逻辑和资金开始同向,但基本面还没跟上——现在等的是${verifyHint}的证据。`;
  if (logic === "strengthen" && bear)
    return "需求侧还在增强,但资金已在高位换手——涨了一段后的分歧期,盯紧筹码去向和新验证,别只看事件热度。";
  if (logic === "unchanged" && bear)
    return "产业逻辑没有新的破坏,但资金明显撤离——短期市场行为和长期逻辑正在背离。";
  if (logic === "sentiment" && bull)
    return "资金很热,但目前更像题材交易,还不能认为产业受益已经成立。";
  if (logic === "sentiment" && bear)
    return `情绪映射为主的板块,资金退潮时更要回到${verifyHint}这类硬证据。`;
  if (intent === "wash")
    return `暂时更像洗盘,不是基本面逻辑失效——${verifyHint}的新验证比盘面更重要。`; // copylint-allow: Judgment 模板句(结构化语境豁免)
  if (logic === "weaken" && bear)
    return "逻辑与资金同向转弱,现在更该看需求侧有没有新变化,而不是盘面波动。";
  if (intent === "divergence")
    return "主力与散户在对立交易,方向未定——分歧期更适合等验证,而不是追方向。";
  if (intent === "exhaustion")
    // 按产业逻辑分句(2026-08-14 三轮走查:同判衰竭的两卡并排,句子必须真的不同,不能只换尾巴)
    return logic === "strengthen"
      ? `需求侧还在增强,但资金动能先退坡了——在${verifyHint}给出新证据前,热度可能继续降温。`
      : `上行动能在退坡,若没有新事件或新验证,留意情绪自然降温——下一个方向信号,盯${verifyHint}。`;
  return `今天没有值得单独说的资金行为,关注点回到${verifyHint}的验证节奏。`;
}

// 链归属过滤(与 chain-timeline 同口径):触发源主链命中,或映射标的在链内
function ownItems(items: BriefingItem[], chainId: string): BriefingItem[] {
  return items.filter(
    (it) =>
      (it.triggerCode && resolvePrimary(it.triggerCode)?.chainId === chainId) ||
      it.beneficiaries.some((b) => resolveInChain(b.code, chainId))
  );
}

function buildOne(
  def: (typeof CHAIN_DEFS)[number],
  ymd: string,
  todaySnaps: SegmentIntentSnapshot[],
  items: BriefingItem[]
): ChainJudgment | null {
  const segs = todaySnaps.filter((s) => SEGMENT_BY_KEY[s.segment]?.chainSlugs.includes(def.slug));
  if (segs.length === 0) return null;
  const dominant = segs
    .slice()
    .sort((a, b) => INTENT_SEVERITY[a.intent.intent] - INTENT_SEVERITY[b.intent.intent])[0];
  const intent = dominant.intent.intent;

  // 链内分化:同链同时出现进(吸/抢)与出(派/撤)
  const bullSegs = segs.filter((s) => BULL.includes(s.intent.intent));
  const bearSegs = segs.filter((s) => BEAR.includes(s.intent.intent));
  const segName = (s: SegmentIntentSnapshot) => SEGMENT_BY_KEY[s.segment]?.name ?? s.segment;
  const splitNote =
    bullSegs.length > 0 && bearSegs.length > 0
      ? `链内分化:${bullSegs.map(segName).join("、")}${bullSegs[0].intent.label},${bearSegs
          .map(segName)
          .join("、")}${bearSegs[0].intent.label}——更值得看${segName(bullSegs[0])}这一段。`
      : null;

  // 产业逻辑:今日链级事件方向;无事件 → 按链的关系构成给基线(直接映射稀薄的链=情绪基线)
  const chainId = chainIdFromSlug(def.slug) ?? def.slug;
  const evts = ownItems(items, chainId);
  let logic: IndustryLogic;
  if (evts.length > 0) {
    const ups = evts.filter((e) => (e.triggerChange ?? 0) > 0).length;
    const downs = evts.filter((e) => (e.triggerChange ?? 0) < 0).length;
    logic = downs === 0 && ups > 0 ? "strengthen" : ups === 0 && downs > 0 ? "weaken" : "unchanged";
  } else {
    logic = def.slug === "ai-application" ? "sentiment" : "unchanged";
  }

  // 基本面验证(v1 线索级,如实降格:事件点名了链内【直接映射】标的=出现新的验证线索,
  // 记 partial;披露级验证(公告/财报解析)是后续增强,new/contrary 档位先保留不产)
  const verification: VerificationState = evts.some((e) =>
    e.beneficiaries.some((b) => resolveInChain(b.code, chainId)?.relationType === "direct")
  )
    ? "partial"
    : "none";

  const headline = `${def.name}:${LOGIC_PHRASE[logic]},${INTENT_PHRASE[intent]}。`;
  const eventLine =
    evts.length > 0 ? `今日链级事件:${evts[0].title}。` : "今日无链级新事件。";
  const intentLine = dominant.intent.evidence[0] ? `${dominant.intent.evidence[0]}。` : "";
  const body = `${eventLine}${intentLine}`;

  const rank =
    (7 - INTENT_SEVERITY[intent]) +
    (logic === "strengthen" || logic === "weaken" ? 2 : 0) +
    (splitNote ? 2 : 0) +
    (verification !== "none" ? 1 : 0) +
    (dominant.intent.confidence === "high" ? 1 : 0);

  // 展示字段(首页卡片四行轻量信息):环节=链内板块按信息量序;映射=insight 核定 direct 优先
  const coreSegments = segs
    .slice()
    .sort((a, b) => INTENT_SEVERITY[a.intent.intent] - INTENT_SEVERITY[b.intent.intent])
    .map(segName)
    .slice(0, 3);
  const mappings = INSIGHT_CHAINS[def.slug]?.mappings ?? [];
  const repStocks = [
    ...mappings.filter((m) => m.relation === "直接"),
    ...mappings.filter((m) => m.relation !== "直接"),
  ]
    .map((m) => m.name)
    .slice(0, 3);

  return {
    ymd,
    chainSlug: def.slug,
    chainName: def.name,
    href: def.href,
    logic,
    intent,
    intentLabel: dominant.intent.label,
    confidence: CONFIDENCE_LABEL[dominant.intent.confidence],
    confidenceRaw: dominant.intent.confidence,
    segmentName: segs.length > 1 ? segName(dominant) : null,
    verification,
    hasEvent: evts.length > 0,
    logicLabel: LOGIC_CHIP[logic],
    coreSegments,
    repStocks,
    verifyHint: def.verifyHint,
    headline,
    body,
    take: takeOf(logic, intent, verification, def.verifyHint),
    splitNote,
    rank,
  };
}

// ---- 链级资金微趋势(首页视觉优化 2026-08-17:主线大卡「一条微型趋势图」)----
// 口径:链下各板块当日主力净额(mainNetYi)合计,近 n 个交易日——与卡内「资金」行同源,
// 只呈现资金动能节奏,不是行情图,不预示涨跌。纯派生,零新数据。
export interface ChainTrendPoint {
  ymd: string;
  v: number; // 链内板块主力净额合计(亿)
}

export function buildChainFundTrends(
  snaps: SegmentIntentSnapshot[]
): Record<string, ChainTrendPoint[]> {
  const byChain: Record<string, Map<string, number>> = {};
  for (const s of snaps) {
    const seg = SEGMENT_BY_KEY[s.segment];
    if (!seg) continue;
    for (const slug of seg.chainSlugs) {
      const m = (byChain[slug] ??= new Map());
      m.set(s.ymd, (m.get(s.ymd) ?? 0) + s.metrics.mainNetYi);
    }
  }
  const out: Record<string, ChainTrendPoint[]> = {};
  for (const [slug, m] of Object.entries(byChain)) {
    out[slug] = Array.from(m.entries())
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([ymd, v]) => ({ ymd, v: Math.round(v * 10) / 10 }));
  }
  return out;
}

const ymdToISO = (ymd: string) => `${ymd.slice(0, 4)}-${ymd.slice(4, 6)}-${ymd.slice(6, 8)}`;

// 构建全部链 Judgment(rank 降序;首页取前 3,存档存全部)
export async function buildDailyJudgments(): Promise<{ ymd: string; judgments: ChainJudgment[] } | null> {
  const snaps = await recentSnapshots(1).catch(() => []);
  if (snaps.length === 0) return null;
  const ymd = snaps[0].ymd;
  const items = await listBriefing({ date: ymdToISO(ymd), status: "published" }).catch(() => []);
  const judgments = CHAIN_DEFS.map((d) => buildOne(d, ymd, snaps, items)).filter(
    (j): j is ChainJudgment => j !== null
  );
  judgments.sort((a, b) => b.rank - a.rank);
  return { ymd, judgments };
}

// 按日落库(cron 调;subject=chainSlug,upsert 幂等)
export async function saveDailyJudgments(ymd: string, judgments: ChainJudgment[]): Promise<void> {
  const db = getPrisma();
  if (!db) return;
  for (const j of judgments) {
    const data = j as unknown as Prisma.InputJsonValue;
    await db.dailyJudgment.upsert({
      where: { ymd_subject: { ymd, subject: j.chainSlug } },
      create: { ymd, subject: j.chainSlug, data },
      update: { data },
    });
  }
}

// ---- ③ 旧判断复核(v1 从意图历史推,诚实边界:资金行为层面的验证/推翻,非披露级)----
export interface JudgmentReviewEntry {
  tone: "confirm" | "warn";
  date: string; // 原判断日 M/D
  text: string;
  segKey: string; // 板块 key(2.2.7:客户端按「我的自选在不在这个板块」排优先级)
}

export async function buildJudgmentReview(): Promise<JudgmentReviewEntry[]> {
  const snaps = await recentSnapshots(15).catch(() => []);
  if (snaps.length === 0) return [];
  const out: JudgmentReviewEntry[] = [];
  const fmtD = (ymd: string) => `${Number(ymd.slice(4, 6))}/${Number(ymd.slice(6, 8))}`;
  const bySeg = new Map<string, SegmentIntentSnapshot[]>();
  for (const s of snaps) {
    const arr = bySeg.get(s.segment) ?? [];
    arr.push(s);
    bySeg.set(s.segment, arr);
  }
  for (const seg of INTENT_SEGMENTS) {
    const arr = (bySeg.get(seg.key) ?? []).sort((a, b) => a.ymd.localeCompare(b.ymd));
    if (arr.length < 3) continue;
    const today = arr[arr.length - 1];
    // ⚠️ 反转:近 10 日内曾有 ≥2 日连续 进场判断(吸/抢),今天已转 出场档(派/撤)
    if (BEAR.includes(today.intent.intent)) {
      for (let i = arr.length - 3; i >= Math.max(0, arr.length - 11); i--) {
        if (BULL.includes(arr[i].intent.intent) && BULL.includes(arr[i + 1]?.intent.intent)) {
          out.push({
            tone: "warn",
            date: fmtD(arr[i + 1].ymd),
            segKey: seg.key,
            text: `${seg.name}:${fmtD(arr[i + 1].ymd)} 还是${arr[i + 1].intent.label},今天已转为${today.intent.label},期间没有新增基本面证据——这段判断需要重新看。`,
          });
          break;
        }
      }
    }
    // ✅ 验证:近 5 日内出现过洗盘特征判断,之后资金重新回流(吸/抢)且延续到今天或昨天 // copylint-allow: 意图词注释(结构化语境)
    if (BULL.includes(today.intent.intent)) {
      for (let i = arr.length - 2; i >= Math.max(0, arr.length - 6); i--) {
        if (arr[i].intent.intent === "wash") {
          out.push({
            tone: "confirm",
            date: fmtD(arr[i].ymd),
            segKey: seg.key,
            text: `${seg.name}:${fmtD(arr[i].ymd)} 的${arr[i].intent.label}判断正在被验证——资金已重新回流(今天${today.intent.label})。`,
          });
          break;
        }
      }
    }
  }
  return out.slice(0, 4);
}
