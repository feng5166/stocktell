// 「其他产业链我想要」投票的链清单(单一来源):
// ChainSwitcher 展示 与 /api/chain-interest 服务端校验共用。
// 服务端必须按 key 白名单校验 —— chain 值若由客户端自由填,投票表会被伪造 key 灌脏,
// 而这份计数是排产优先级的决策输入(2026-07-30 review)。
export const VOTE_CHAINS: { key: string; name: string; ready: boolean }[] = [
  { key: "ai", name: "AI 产业链", ready: true },
  { key: "newenergy", name: "新能源 · 光伏储能", ready: false },
  { key: "pharma", name: "创新药 · 医药", ready: false },
  { key: "semi", name: "半导体设备材料", ready: false },
  { key: "robot", name: "机器人 · 具身", ready: false },
  { key: "military", name: "军工", ready: false },
];

export const VOTE_CHAIN_KEYS = new Set(VOTE_CHAINS.map((c) => c.key));
