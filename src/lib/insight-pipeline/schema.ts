// insight 管线 · DailyInsightPayload 类型与校验(PRD §4.2,单一来源)。
// 校验是护栏第一道(阻断型):枚举外值/缺段/超长/生成侧 confidence=高,任一即失败。
import type { ChainSegment } from "@/data/chains";

export type HeatDirection = "升温" | "降温" | "分化" | "观察";
export type RelationLabel = "直接映射" | "间接映射" | "情绪映射";
export type MappingRelation = RelationLabel | "弱映射"; // 弱映射=后台内部档,前台渲染归并入情绪映射(增补#5)

// ---- References v1/v2(PRD prd-trust-chat-pro-intent §3.4 · PR3)----
// v1 已落在历史 InsightDoc.payload 里,【不可原地破坏、不批量伪迁移】;生成侧升 v2,
// 读取端(展示 adapter / guard / admin)同时吃两种形状。判别函数 isRefV2 是唯一分流点。
export type ReferenceV1 = {
  name: string;
  url: string;
  date?: string;
  supports: string;
  kind: "具体来源" | "常设入口";
  verified: boolean;
};
export const REF_SOURCE_TYPES = [
  "official", // 公司官网 / IR
  "filing", // 法定披露(巨潮/上交所/财报)
  "regulatory", // 监管文件
  "market", // 行情/金融数据
  "news", // 新闻报道
  "research", // 第三方研究
  "history", // 历史复盘
] as const;
export type RefSourceType = (typeof REF_SOURCE_TYPES)[number];
export type RefTargetType = "judgment" | "risk" | "hop" | "heat" | "mapping";
export type ReferenceV2 = {
  id: string; // payload 内唯一(生成侧 r1..rn 确定性编号,replay 可比)
  name: string;
  url?: string; // 只能来自博查检索或人工录入(铁律:模型不得自产 URL)
  sourceType: RefSourceType;
  kind: "specific" | "standing_entry"; // 具体材料 / 常设核实入口
  publishedAt?: string; // 只有具体材料才有——常设入口不伪造发布日期(校验强制)
  checkedAt?: string; // 最近一次可达探测时间(跳过探测时缺席,不出伪时间戳)
  verified: boolean;
  role: "fact" | "reasoning" | "hypothesis";
  supportsText: string;
  targets: { type: RefTargetType; id: string }[]; // 机器可靠绑定:judgment/risk 用固定 id,hop=order,heat=环节名,mapping=code
};
export type DailyReference = ReferenceV1 | ReferenceV2;
export const isRefV2 = (r: DailyReference): r is ReferenceV2 =>
  typeof (r as ReferenceV2).supportsText === "string";

// ---- 当日传导路径 hops(2026-07-30)----
// 多跳推理的【每日】结构化落地(PRODUCT-CORE §9 的最大缺口:此前 hops 只存在于静态
// InsightChain,每日 doc 只有热力+映射,归档不含当日传导路径)。路线=规则优先、零幻觉:
// 骨架(from/to/plain/logic/confidence)逐字来自人工核定的静态 mainHops/branchHops,
// 当日状态由规则 join 注入——静态 heatmap.hopOrder → 环节名 → 当日 heat 行,todayNote
// 逐字复用当日 heat.reason(已过 runGuards 扫描的文本),【不为 hops 新生成任何散文】。
// 可选字段:历史 doc 无此字段照常有效,读端判空渲染;事件专篇的 LLM 生成 hops 属 M2,另立项。
export type DailyHop = {
  order: number;
  from: string;
  to: string;
  plain: string; // 静态骨架人话(人工核定)
  logic: string; // 静态专业逻辑(人工核定)
  confidence: "高" | "中" | "低";
  kind: "main" | "branch";
  todaySegment?: string; // 命中的当日热力环节
  todayDirection?: HeatDirection;
  todayNote?: string; // = 当日 heat.reason 同文
};

export interface DailyInsightPayload {
  // v1=历史归档(references 为 ReferenceV1);v2=2026-07-12 起生成侧产出(ReferenceV2)
  version: 1 | 2;
  chainId: string;
  date: string; // YYYY-MM-DD
  trigger: {
    summary: string;
    events: { code: string; name: string; direction: "up" | "down"; magnitude: "大" | "中" }[];
  };
  judgment: string; // 60~140 字人话
  heat: {
    segment: string; // ∈ 链配置 segments(兜底段除外)
    direction: HeatDirection;
    relation: RelationLabel;
    reason: string; // ≤60 字
  }[];
  mappingsDelta: {
    code: string;
    name: string;
    segment: string;
    relation: MappingRelation;
    todayWhy: string; // ≤60 字
    verify: string[]; // 1~3 条
  }[];
  risk: string;
  references: DailyReference[];
  // schema 三档全支持(增补#3);生成侧封顶「中」由护栏强制,「高」只能审核页给
  confidence: "高" | "中" | "低";
  hops?: DailyHop[]; // 当日传导路径(见上,2026-07-30 起生成;历史 doc 无)
}

const DIRECTIONS: HeatDirection[] = ["升温", "降温", "分化", "观察"];
const RELATIONS: RelationLabel[] = ["直接映射", "间接映射", "情绪映射"];
const MAPPING_RELATIONS: MappingRelation[] = [...RELATIONS, "弱映射"];

// 结构校验:返回错误清单(空=通过)。fromGenerator=true 时执行"生成侧封顶中"红线。
export function validateDailyPayload(
  p: unknown,
  segments: ChainSegment[],
  opts?: { fromGenerator?: boolean }
): string[] {
  const errs: string[] = [];
  const d = p as Partial<DailyInsightPayload> | null;
  if (!d || typeof d !== "object") return ["payload 不是对象"];

  if (d.version !== 1 && d.version !== 2) errs.push("version 必须为 1 或 2");
  // 生成侧红线:2026-07-12 起生成器只产 v2——防止改动回退让新旧结构混写
  if (opts?.fromGenerator && d.version !== 2) errs.push("生成侧 version 必须为 2");
  if (!d.chainId) errs.push("缺 chainId");
  if (!d.date || !/^\d{4}-\d{2}-\d{2}$/.test(d.date)) errs.push("date 非法");

  if (!d.trigger || typeof d.trigger.summary !== "string" || !d.trigger.summary.trim())
    errs.push("缺 trigger.summary");
  if (!Array.isArray(d.trigger?.events) || d.trigger!.events.length === 0)
    errs.push("trigger.events 为空");

  if (typeof d.judgment !== "string" || d.judgment.trim().length < 30)
    errs.push("judgment 缺失或过短(<30字)");
  else if (d.judgment.length > 200) errs.push("judgment 超长(>200字)");

  const segNames = new Set(segments.filter((s) => s.sectors.length > 0).map((s) => s.name));
  if (!Array.isArray(d.heat) || d.heat.length === 0) errs.push("heat 为空");
  else {
    const seen = new Set<string>();
    for (const h of d.heat) {
      if (!h || typeof h !== "object") { errs.push("heat 含空元素"); continue; }
      if (!segNames.has(h.segment)) errs.push(`heat 环节名不在枚举:${h.segment}`);
      if (!DIRECTIONS.includes(h.direction)) errs.push(`heat 方向非法:${String(h.direction)}`);
      if (!RELATIONS.includes(h.relation)) errs.push(`heat 关系非法:${String(h.relation)}`);
      if (typeof h.reason !== "string" || !h.reason.trim()) errs.push(`heat[${h.segment}] 缺 reason`);
      else if (h.reason.length > 80) errs.push(`heat[${h.segment}] reason 超长`);
      seen.add(h.segment);
    }
    for (const name of Array.from(segNames))
      if (!seen.has(name)) errs.push(`heat 缺环节:${name}`);
  }

  if (!Array.isArray(d.mappingsDelta)) errs.push("缺 mappingsDelta");
  else
    for (const m of d.mappingsDelta) {
      if (!m || typeof m !== "object") { errs.push("mappingsDelta 含空元素"); continue; }
      if (!m.code || !m.name) errs.push("mappingsDelta 缺 code/name");
      if (!MAPPING_RELATIONS.includes(m.relation))
        errs.push(`mappingsDelta[${m.name}] relation 非法:${String(m.relation)}`);
      if (typeof m.todayWhy !== "string" || m.todayWhy.length > 90)
        errs.push(`mappingsDelta[${m.name}] todayWhy 缺失/超长`);
      if (!Array.isArray(m.verify) || m.verify.length < 1 || m.verify.length > 3)
        errs.push(`mappingsDelta[${m.name}] verify 需 1~3 条`);
    }

  if (typeof d.risk !== "string" || !d.risk.trim()) errs.push("缺 risk");

  // hops 可选(2026-07-30 起生成侧产出;历史 doc 无)。存在则逐项校验:
  // 骨架字段必须齐(来自静态数据,缺=派生代码坏了);today* 三件套要么都缺要么自洽。
  if (d.hops !== undefined) {
    if (!Array.isArray(d.hops) || d.hops.length === 0) errs.push("hops 存在但为空/非数组");
    else if (d.hops.length > 12) errs.push("hops 超长(>12 跳,疑似派生异常)");
    else {
      const orders = new Set<number>();
      for (const h of d.hops) {
        if (!h || typeof h !== "object") { errs.push("hops 含空元素"); continue; }
        if (typeof h.order !== "number") errs.push("hops 缺 order");
        else if (orders.has(h.order)) errs.push(`hops order 重复:${h.order}`);
        else orders.add(h.order);
        if (!h.from?.trim() || !h.to?.trim() || !h.plain?.trim() || !h.logic?.trim())
          errs.push(`hops[${h.order}] 骨架字段缺失(from/to/plain/logic)`);
        if (!["高", "中", "低"].includes(h.confidence)) errs.push(`hops[${h.order}] confidence 非法`);
        if (h.kind !== "main" && h.kind !== "branch") errs.push(`hops[${h.order}] kind 非法`);
        if (h.todayDirection !== undefined && !DIRECTIONS.includes(h.todayDirection))
          errs.push(`hops[${h.order}] todayDirection 非法:${String(h.todayDirection)}`);
        if (h.todaySegment !== undefined && !segNames.has(h.todaySegment))
          errs.push(`hops[${h.order}] todaySegment 不在枚举:${h.todaySegment}`);
      }
    }
  }

  if (!Array.isArray(d.references)) errs.push("缺 references");
  else {
    const ids = new Set<string>();
    for (const r of d.references) {
      if (!r || typeof r !== "object") { errs.push("references 含空元素"); continue; }
      // review P2:v2 payload 不得混入 v1 引用——guard 的 supports 双读会静默吞掉混写,
      // 但混写意味着某段生成/人审代码没升级,必须在校验层炸出来
      if (d.version === 2 && !isRefV2(r)) {
        errs.push(`references[${(r as { name?: string }).name ?? "?"}] v2 payload 混入 v1 引用`);
        continue;
      }
      if (isRefV2(r)) {
        // v2 形状校验(PR3):枚举外值/缺 id/常设入口带日期,任一即失败
        if (!r.id?.trim()) errs.push(`references[${r.name}] 缺 id`);
        else if (ids.has(r.id)) errs.push(`references id 重复:${r.id}`);
        else ids.add(r.id);
        if (r.url && !/^https?:\/\//.test(r.url)) errs.push(`references[${r.name}] url 非法`);
        if (!(REF_SOURCE_TYPES as readonly string[]).includes(r.sourceType))
          errs.push(`references[${r.name}] sourceType 非法:${String(r.sourceType)}`);
        if (r.kind !== "specific" && r.kind !== "standing_entry")
          errs.push(`references[${r.name}] kind 非法:${String(r.kind)}`);
        if (!["fact", "reasoning", "hypothesis"].includes(r.role))
          errs.push(`references[${r.name}] role 非法:${String(r.role)}`);
        if (!r.supportsText?.trim()) errs.push(`references[${r.name}] 缺 supportsText`);
        if (r.kind === "standing_entry" && r.publishedAt)
          errs.push(`references[${r.name}] 常设入口不得携带发布日期(不伪造)`);
        if (!Array.isArray(r.targets)) errs.push(`references[${r.name}] 缺 targets`);
        else
          for (const t of r.targets) {
            if (!t || !["judgment", "risk", "hop", "heat", "mapping"].includes(t.type) || !t.id)
              errs.push(`references[${r.name}] target 非法`);
          }
      } else {
        // v1 兼容校验(历史归档原口径,不收紧)
        if (!r.url || !/^https?:\/\//.test(r.url)) errs.push(`references[${r.name}] url 非法`);
        if (!r.supports) errs.push(`references[${r.name}] 缺 supports`);
      }
    }
  }

  if (!d.confidence || !["高", "中", "低"].includes(d.confidence)) errs.push("confidence 非法");
  else if (opts?.fromGenerator && d.confidence === "高")
    errs.push("生成侧 confidence 不得为「高」(红线:高只能人审给)");

  return errs;
}
