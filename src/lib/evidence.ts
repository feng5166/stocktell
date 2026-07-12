// References 展示收敛(PRD prd-trust-chat-pro-intent §3 · PR1)。
// 现状三套 references(静态 InsightChain / 每日 DailyInsightPayload / 长期 RelationReference)
// 结构不同、语义漂移——本模块【不改任何生产结构】,只做展示层统一:
//   ① EvidenceItem:统一证据卡字段(名称/类型/日期/支撑/来源角色/核实状态);
//   ② 三个 adapter:各套结构 → EvidenceItem(诚实映射,不虚构字段:常设入口不给日期、
//      未探测的不标"已核实");
//   ③ matchReferences:迁移期显式规则匹配(supports 自由文本 × hop 步骤号/环节 token/股票名码),
//      匹配不到的留"其他来源",绝不硬绑——机器可靠绑定等 Reference v2 的 targets(PR3)。
// 纯函数、零依赖 DB,server/client 都可 import。
import type { InsightChain } from "@/data/insight-chains";
import type { RelationReference } from "@/data/chain-relations";
import { isRefV2, type DailyReference, type RefSourceType } from "@/lib/insight-pipeline/schema";

// 核实状态四档(PRD §3.3):与「结论置信度」分开表达——链接可达只代表材料存在,
// 不代表 StockTell 的推论成立(置信度仍由判断行自己的置信徽章表达)。
export type EvidenceVerify =
  | "verified" // 已核实可达(具体材料,链接实测可达)
  | "standing" // 常设核实入口(官方长期页面,不得标"已证明具体结论")
  | "unreachable" // 当前不可达(保留名称与状态,不自动删除历史证据)
  | "pending"; // 待验证(有日期材料但未做可达探测)

// 来源角色(PRD §3.3):v1 三套结构里的 reference 都是外部材料=事实来源;
// "StockTell 推理 / 推理假设"由【无引用时的空态】表达(EvidencePanel 空态 chip),
// 字段先留全枚举,Reference v2 落 role 字段后 adapter 直读。
export type EvidenceRole = "fact" | "reasoning" | "hypothesis";

export type EvidenceItem = {
  id: string; // 埋点/追问引用标识(v2 用真 id;v1 回退 url→name)
  name: string;
  url?: string;
  sourceType?: string; // 展示用来源类型(v1 沿用自由文本;v2 枚举→中文标签)
  kind: "specific" | "standing"; // 具体来源 / 常设入口
  date?: string; // 只有具体材料才有(常设入口不伪造发布日期)
  supports?: string; // 一句话:支撑当前判断的哪部分
  role: EvidenceRole;
  verify: EvidenceVerify;
  // v2 机器绑定(来自 ReferenceV2.targets / 静态 targets):存在时匹配以它为准,文本规则不再参与
  targets?: { type: string; id: string }[];
};

type InsightRef = InsightChain["references"][number];

// ---- adapter ①:静态骨架 InsightChain.references ----
// 人工定稿数据:「具体来源」在定稿时已人工核实链接(页面既有口径"已核实"),映射 verified;
// 「常设入口」映射 standing。
export function fromInsightRef(r: InsightRef): EvidenceItem {
  const standing = r.kind === "常设入口";
  return {
    id: r.url || r.name,
    name: r.name,
    url: r.url,
    sourceType: r.type,
    kind: standing ? "standing" : "specific",
    date: standing ? undefined : r.date,
    supports: r.supports ?? r.note,
    role: "fact",
    verify: standing ? "standing" : "verified",
    targets: r.targets, // PR3:静态骨架逐条人工绑定的稳定 targets(有则精确匹配)
  };
}

// v2 sourceType 枚举 → 前台中文标签(PRD §3.3 来源类型列)
const V2_SOURCE_LABEL: Record<RefSourceType, string> = {
  official: "公司官网/IR",
  filing: "法定披露",
  regulatory: "监管文件",
  market: "行情数据",
  news: "新闻",
  research: "第三方研究",
  history: "历史复盘",
};

// ---- adapter ②:每日 DailyReference(v1/v2 双读,PR3)----
// v1(历史归档):verified=false → 「当前不可达」(生产管线必跑探测;SKIP 开关严禁上 Vercel)。
// v2:checkedAt 缺席=没跑过探测 → 「待验证」,跑过且 false → 「当前不可达」——比 v1 更诚实。
export function fromDailyRef(r: DailyReference): EvidenceItem {
  if (isRefV2(r)) {
    const standing = r.kind === "standing_entry";
    return {
      id: r.id || r.url || r.name,
      name: r.name,
      url: r.url,
      sourceType: V2_SOURCE_LABEL[r.sourceType] ?? r.sourceType,
      kind: standing ? "standing" : "specific",
      date: standing ? undefined : r.publishedAt,
      supports: r.supportsText,
      role: r.role,
      verify: standing ? "standing" : r.verified ? "verified" : r.checkedAt ? "unreachable" : "pending",
      targets: r.targets,
    };
  }
  const standing = r.kind === "常设入口";
  return {
    id: r.url || r.name,
    name: r.name,
    url: r.url,
    kind: standing ? "standing" : "specific",
    date: standing ? undefined : r.date,
    supports: r.supports,
    role: "fact",
    verify: standing ? "standing" : r.verified ? "verified" : "unreachable",
  };
}

// 当日引用按 judgment/risk 目标选取(页面用):v2 有显式 targets 的按 targets 过滤;
// v1 与无 targets 的保持旧口径=当日全部引用都属于今日判断/风险(不让历史归档突然变空)。
export function dailyRefsFor(kind: "judgment" | "risk", refs: DailyReference[]): EvidenceItem[] {
  const items = refs.map(fromDailyRef);
  return items.filter(
    (i) => !i.targets?.length || i.targets.some((t) => t.type === kind)
  );
}

// ---- adapter ③:长期关系 RelationReference ----
// 无 kind 字段:带 publishedAt 的是具体材料(未做可达探测 → pending),
// 无日期的按常设入口(法定披露页/官网 IR 本就是长期入口)。sourceType 枚举 → 前台中文。
const REL_SOURCE_LABEL: Record<RelationReference["sourceType"], string> = {
  company_report: "财报/定期报告",
  exchange_disclosure: "法定披露",
  official_site: "公司官网/IR",
  financial_data: "行情/金融数据",
  news: "新闻",
  manual_review: "人工审阅",
};
export function fromRelationRef(r: RelationReference): EvidenceItem {
  const specific = Boolean(r.publishedAt);
  return {
    id: r.url || r.title,
    name: r.title,
    url: r.url,
    sourceType: REL_SOURCE_LABEL[r.sourceType] ?? r.sourceType,
    kind: specific ? "specific" : "standing",
    date: specific ? r.publishedAt : undefined,
    supports: r.note,
    role: "fact",
    verify: specific ? "pending" : "standing",
  };
}

// ---- 迁移期匹配(PR1):supports 自由文本 × 目标 的显式规则 ----
// 规则刻意保守(宁可落"其他来源",不硬绑错):
//   hop     → supports 含「第N步」且 N=hop.order(现有数据写法:「主线第2步(…)」);
//   heat    → 环节名按 / · 空格 括号 切 token(≥2字),任一 token 出现在 supports 里
//             (「光模块 / 高速互连」↔「光模块环节」;「存储 / HBM」↔「HBM/存储环节」);
//   mapping → 股票名或代码出现在 supports 或来源名里(「中际旭创 · 巨潮资讯法定披露页」),
//             或其环节 token 命中(环节级来源同样支撑该环节的票)。
export type EvidenceTarget =
  | { type: "hop"; order: number }
  | { type: "heat"; segment: string }
  | { type: "mapping"; name: string; code?: string; segment?: string };

// token 门槛:中文 ≥2 字;纯 ASCII ≥3 字符——"AI" 这类泛词在全链 supports 里到处出现,
// 2 字符放行会让 AI 应用链每个环节命中全部引用(真实数据冒烟实测),HBM/UPS(3 字符)保留。
const tokenize = (s: string): string[] =>
  s
    .split(/[/·()()\s]+/)
    .map((t) => t.trim())
    .filter((t) => (/[^\x00-\x7F]/.test(t) ? t.length >= 2 : t.length >= 3));

const stepNumbers = (supports: string): number[] =>
  Array.from(supports.matchAll(/第(\d+)步/g)).map((m) => Number(m[1]));

// 目标的稳定 id 集(PR3 约定,与静态数据 targets 同一套):hop=order 字符串、
// heat=环节原名、mapping=code(无 code 用 name;两者都算,防绑定用了另一个)。
function stableIdsOf(target: EvidenceTarget): string[] {
  switch (target.type) {
    case "hop":
      return [String(target.order)];
    case "heat":
      return [target.segment];
    case "mapping":
      return [target.code, target.name].filter((x): x is string => Boolean(x));
  }
}

function matchesTarget(item: EvidenceItem, target: EvidenceTarget): boolean {
  // v2 显式绑定优先:有 targets 就只认 targets(机器可靠,不再跑文本规则——
  // 否则「绑了 A 却被文本规则蹭到 B」会让人工绑定失去意义)
  if (item.targets?.length) {
    const ids = stableIdsOf(target);
    return item.targets.some((t) => t.type === target.type && ids.includes(t.id));
  }
  const supports = item.supports ?? "";
  switch (target.type) {
    case "hop":
      return stepNumbers(supports).includes(target.order);
    case "heat":
      return tokenize(target.segment).some((t) => supports.includes(t));
    case "mapping": {
      const hay = `${supports} ${item.name}`;
      if (hay.includes(target.name)) return true;
      if (target.code && hay.includes(target.code)) return true;
      return target.segment ? tokenize(target.segment).some((t) => supports.includes(t)) : false;
    }
  }
}

export function matchReferences(target: EvidenceTarget, items: EvidenceItem[]): EvidenceItem[] {
  return items.filter((it) => matchesTarget(it, target));
}
