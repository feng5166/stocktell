// insight 管线 · DailyInsightPayload 类型与校验(PRD §4.2,单一来源)。
// 校验是护栏第一道(阻断型):枚举外值/缺段/超长/生成侧 confidence=高,任一即失败。
import type { ChainSegment } from "@/data/chains";

export type HeatDirection = "升温" | "降温" | "分化" | "观察";
export type RelationLabel = "直接映射" | "间接映射" | "情绪映射";
export type MappingRelation = RelationLabel | "弱映射"; // 弱映射=后台内部档,前台渲染归并入情绪映射(增补#5)

export interface DailyInsightPayload {
  version: 1;
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
  references: {
    name: string;
    url: string;
    date?: string;
    supports: string;
    kind: "具体来源" | "常设入口";
    verified: boolean;
  }[];
  // schema 三档全支持(增补#3);生成侧封顶「中」由护栏强制,「高」只能审核页给
  confidence: "高" | "中" | "低";
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

  if (d.version !== 1) errs.push("version 必须为 1");
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

  if (!Array.isArray(d.references)) errs.push("缺 references");
  else
    for (const r of d.references) {
      if (!r || typeof r !== "object") { errs.push("references 含空元素"); continue; }
      if (!r.url || !/^https?:\/\//.test(r.url)) errs.push(`references[${r.name}] url 非法`);
      if (!r.supports) errs.push(`references[${r.name}] 缺 supports`);
    }

  if (!d.confidence || !["高", "中", "低"].includes(d.confidence)) errs.push("confidence 非法");
  else if (opts?.fromGenerator && d.confidence === "高")
    errs.push("生成侧 confidence 不得为「高」(红线:高只能人审给)");

  return errs;
}
