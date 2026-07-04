// 关系档 UI 常量(零依赖模块——server 与 client 都可 import,不把 insight 数据拖进客户端包)。
// 单一真源:排序权重 + 配色都在这里改,所有关系标签(ChainRoster/链页/insight 页/home-feed)跟着变,
// 杜绝"改一处配色漏几处"(本会话已在 3 处各抄一份同色表)。

// 前台关系档排序权重(直接>间接>情绪>弱)。
export const FRONT_RELATION_RANK: Record<string, number> = {
  直接映射: 0,
  间接映射: 1,
  情绪映射: 2,
  弱映射: 3,
};

// 关系档配色(单一真源:改这里,长键/短键两套映射一起变)。
const TIER_CLS = {
  direct: "bg-rose-100 text-rose-700",
  indirect: "bg-amber-100 text-amber-700",
  sentiment: "bg-slate-100 text-slate-500",
  weak: "bg-gray-200 text-gray-500",
  generic: "bg-gray-100 text-gray-600",
};

// 前台长标签键(ChainRoster 成分股标 / 链页事件卡 relationLabelFor)。
export const REL_CHIP_CLS: Record<string, string> = {
  直接映射: TIER_CLS.direct,
  间接映射: TIER_CLS.indirect,
  情绪映射: TIER_CLS.sentiment,
  弱映射: TIER_CLS.weak,
  产业链相关: TIER_CLS.generic,
};

// 短标签键(insight 页 Relation 类型:直接/间接/情绪映射/弱)。
export const REL_CHIP_CLS_SHORT: Record<string, string> = {
  直接: TIER_CLS.direct,
  间接: TIER_CLS.indirect,
  情绪映射: TIER_CLS.sentiment,
  弱: TIER_CLS.weak,
};
