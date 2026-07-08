// 关系档 UI 常量(零依赖模块——server 与 client 都可 import,不把 insight 数据拖进客户端包)。
// 单一真源:排序权重 + 配色都在这里改,所有关系标签(ChainRoster/链页/insight 页/home-feed/
// 首页事件卡)跟着变,杜绝"改一处配色漏几处"。
// import type 编译期擦除、不产生运行时依赖,故仍是零依赖(用于短键映射的穷尽性检查)。
import type { Relation } from "@/data/insight-chains";
import type { RelationType } from "@/data/chain-relations";

// ============================================================================
// Phase 3-A 退双轨 adapter(负责人 2026-07-04 拍板)。全站关系主展示统一读 relationType,
// 强/中/弱退场。此 adapter 是唯一"relationType → 展示徽章"映射,zero-dep(仅 type import)。
// ============================================================================
export type RelationBadge = {
  label: string;
  shortLabel: string;
  description: string;
  tone: RelationType;
  priority: number;
};
const REL_BADGE: Record<RelationType, RelationBadge> = {
  trigger: { label: "触发源", shortLabel: "触发", tone: "trigger", priority: 5, description: "海外或上游事件触发源,不等于国内公司直接受益。" },
  direct: { label: "直接映射", shortLabel: "直接", tone: "direct", priority: 0, description: "产业链传导路径较短,仍需订单、客户、收入占比、毛利率等公开信息验证。" },
  indirect: { label: "间接映射", shortLabel: "间接", tone: "indirect", priority: 1, description: "存在产业链间接关系,需要结合环节变化和公司业务披露验证。" },
  sentiment: { label: "情绪映射", shortLabel: "情绪", tone: "sentiment", priority: 2, description: "更多是市场情绪或同题材映射,不代表基本面传导。" },
  weak: { label: "弱映射", shortLabel: "弱", tone: "weak", priority: 3, description: "关系较弱,仅作为观察线索,不作为核心产业链映射。" },
  candidate: { label: "待验证", shortLabel: "待验证", tone: "candidate", priority: 4, description: "待验证关系,尚未进入正式静态关系库。" },
};
export function relationTypeToDisplayBadge(rt: RelationType): RelationBadge {
  return REL_BADGE[rt] ?? REL_BADGE.candidate;
}

// chain-relations 的 chainId → /chain/[id] 路由 id(= CHAINS 的 id)。
// AI 主链 chainId="ai-infra" 但路由是 /chain/ai(CHAINS id="ai");电力链 chainId 与路由一致。
// 修 P0:AI 股"查看链"拼 /chain/ai-infra → getChain=CHAINS["ai-infra"]=null → notFound() 全 404。
// ai-infra / ai-application 都归 AI 主链页 /chain/ai(AI 应用暂无独立 /chain/ai-application 路由);
// 电力链 chainId 与路由一致。
export const chainRouteId = (chainId: string | undefined): string =>
  chainId === "ai-infra" || chainId === "ai-application" ? "ai" : chainId ?? "";
// 反向:/chain/[id] 路由 id → chain-relations chainId(链页用 resolveInChain 时)。/chain/ai → ai-infra。
export const chainIdFromRoute = (routeId: string): string => (routeId === "ai" ? "ai-infra" : routeId);
// insight slug → chain-relations chainId(简报/admin 切 resolver 时)。仅 datacenter-power→data-center-power 有别。
export const chainIdFromSlug = (slug: string | undefined): string | undefined =>
  slug === "datacenter-power" ? "data-center-power" : slug;
// fallback:旧 strength(强/中/弱)→ relationType,仅用于无 relationType 的旧数据。调用侧要打 warning。
export function strengthToRelationType(strength: string): RelationType {
  return strength === "强" ? "direct" : strength === "中" ? "indirect" : "weak";
}

// 前台关系档排序权重(直接>间接>情绪>弱)。
export const FRONT_RELATION_RANK: Record<string, number> = {
  直接映射: 0,
  间接映射: 1,
  情绪映射: 2,
  弱映射: 3,
};

// 关系档配色(单一真源:改这里,长键/短键两套映射一起变)。
// 色系收敛(负责人 2026-07-08 首页改版拍板):关系档一人一色、全站单源——
// 直接=紫 / 间接=蓝 / 情绪=橙 / 弱=灰 / 触发源=灰蓝 / 待验证=黄;
// 【红色只留给合规提示与异常】(此前直接映射用红,页面像满屏警告)。
const TIER_CLS = {
  direct: "bg-violet-100 text-violet-700",
  indirect: "bg-blue-100 text-blue-700",
  sentiment: "bg-orange-100 text-orange-700",
  weak: "bg-gray-200 text-gray-500",
  trigger: "bg-slate-200 text-slate-600",
  generic: "bg-amber-50 text-amber-700", // 待验证
};

// 前台长标签键(ChainRoster 成分股标 / 链页事件卡 relationLabelFor / /stocks 关系分布)。
export const REL_CHIP_CLS: Record<string, string> = {
  直接映射: TIER_CLS.direct,
  间接映射: TIER_CLS.indirect,
  情绪映射: TIER_CLS.sentiment,
  弱映射: TIER_CLS.weak,
  触发源: TIER_CLS.trigger,
  待验证: TIER_CLS.generic,
  产业链相关: TIER_CLS.generic,
};

// 证据状态前台友好标签(负责人拍板:前台【不显】"verified" 英文档,避免误读成"已确认受益")。
// 后台/审阅台仍用英文档;凡前台展示 evidenceStatus 一律走这里映射。
export const EVIDENCE_LABEL: Record<string, string> = {
  verified: "已接入披露源",
  partially_verified: "部分待核验",
  needs_review: "待补来源",
  manual_only: "待补来源",
};

// 短标签键(insight 页 Relation 类型)。用 Record<Relation,string> 拿穷尽性检查:
// 将来 Relation 加第 5 档而这里不补键 → 编译报错(而非 chip 静默掉底色)。
export const REL_CHIP_CLS_SHORT: Record<Relation, string> = {
  直接: TIER_CLS.direct,
  间接: TIER_CLS.indirect,
  情绪映射: TIER_CLS.sentiment,
  弱: TIER_CLS.weak,
};
