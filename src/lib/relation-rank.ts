// 前台关系档排序权重(直接>间接>情绪>弱)。独立【零依赖】模块——server(home-feed)与
// client(ChainRoster)都可 import,不把 insight 数据(relation.ts→insight-chains)拖进客户端包。
export const FRONT_RELATION_RANK: Record<string, number> = {
  直接映射: 0,
  间接映射: 1,
  情绪映射: 2,
  弱映射: 3,
};
