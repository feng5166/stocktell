// Market Intent v1 板块定义(2.2.2):负责人拍板首批 8 个成熟板块,与现有链路高度重合。
// 成员 = 股池内 A 股按 stocks.ts sector 粗分归属(等权聚合);龙头 = TIER 圈定的板块龙头,
// 按序取当日有数据的第一只(算龙头相对表现)。chainSlugs 关联 insight 链(chain event 判定
// + 2.2.3 Chain 页挂载点)。不做全市场——先在已覆盖板块上验证意图算法。
import { STOCKS, type Sector } from "@/data/stocks";

export interface IntentSegment {
  key: string;
  name: string; // 人话名(前台展示)
  sectors: Sector[]; // stocks.ts 粗分板块归属
  leaders: string[]; // 龙头候选(按序取当日有数据的第一只)
  chainSlugs: string[]; // 关联 insight 链 slug(事件命中判定)
}

export const INTENT_SEGMENTS: IntentSegment[] = [
  { key: "cpo-optics", name: "CPO/光模块", sectors: ["光模块/CPO"], leaders: ["300308", "300502"], chainSlugs: ["ai-infra"] },
  { key: "ai-server", name: "AI 服务器", sectors: ["服务器/算力"], leaders: ["601138", "000977"], chainSlugs: ["ai-infra"] },
  { key: "pcb", name: "PCB", sectors: ["PCB/CCL"], leaders: ["002463", "300476"], chainSlugs: ["ai-infra"] },
  { key: "semi-equipment", name: "半导体设备", sectors: ["半导体设备"], leaders: ["002371", "688012"], chainSlugs: ["semiconductor-equipment"] },
  { key: "storage-hbm", name: "存储/HBM", sectors: ["存储/HBM"], leaders: ["603986", "688008"], chainSlugs: ["ai-infra"] },
  { key: "dc-power", name: "数据中心电源", sectors: ["电源/HVDC"], leaders: ["002851", "300693"], chainSlugs: ["datacenter-power"] },
  { key: "liquid-cooling", name: "液冷/温控", sectors: ["液冷/温控"], leaders: ["002837", "002335"], chainSlugs: ["datacenter-power"] },
  { key: "ai-application", name: "AI 应用", sectors: ["大模型/应用"], leaders: ["002230", "688111"], chainSlugs: ["ai-application"] },
];

export const SEGMENT_BY_KEY: Record<string, IntentSegment> = Object.fromEntries(
  INTENT_SEGMENTS.map((s) => [s.key, s])
);

// 板块成员(A 股;跨 sector 去重,一票只进一个 segment 不存在——sectors 互斥)
export function segmentMembers(seg: IntentSegment): { code: string; name: string }[] {
  return STOCKS.filter((s) => s.market === "A股" && seg.sectors.includes(s.sector)).map(
    (s) => ({ code: s.code, name: s.name })
  );
}
