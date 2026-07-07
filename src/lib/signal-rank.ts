// 信号强度权重(三轮 review 清理:{强,中,弱} 权重表此前全库第 5 份拷贝)。
// 独立小模块(零依赖):客户端组件也要用,不能把 relation-resolver(拖 chain-relations 数据)
// 打进客户端包。
export type SignalStrength = "强" | "中" | "弱";
export const SIGNAL_RANK: Record<SignalStrength, number> = { 强: 3, 中: 2, 弱: 1 };
