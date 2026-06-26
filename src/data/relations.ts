// 关系强弱 + 依据:把"美股 → A 股"映射边分 强/中/弱,让散户分清「真供货」和「蹭概念」。
// 强 = 有明确供货/直接业务绑定;中 = 对标/国产替代叙事(无直接供货);弱 = 同主题/概念关联。
// 叠加在 stocks.ts 的 relations 之上,不改那个大数组。未显式标注的边按 A 股端 relationTypes 派生。
import { STOCK_MAP } from "@/data/stocks";

export type Strength = "强" | "中" | "弱";
export interface EdgeInfo {
  strength: Strength;
  basis: string;
}

// 显式标注的关键边:key = `${美股code}->${A股code}`
const EDGES: Record<string, EdgeInfo> = {
  // —— 强:直接供货 / 业务高度绑定 ——
  "NVDA->300308": { strength: "强", basis: "光模块核心供应商,绑定英伟达与海外云资本开支" },
  "NVDA->601138": { strength: "强", basis: "AI 服务器代工,直接组装英伟达方案" },
  "MRVL->300502": { strength: "强", basis: "高速光模块,海外大客户订单占比高" },
  "MRVL->300394": { strength: "强", basis: "光器件平台,光模块上游配套" },
  "VRT->002837": { strength: "强", basis: "数据中心液冷,业务与 Vertiv 高度对标" },
  "MU->688008": { strength: "强", basis: "内存接口芯片,与 HBM/DDR5 直接配套" },
  "COHR->002281": { strength: "强", basis: "光芯片/光器件,光通信上游配套" },

  // —— 中:对标 / 国产替代,无直接供货 ——
  "NVDA->688041": { strength: "中", basis: "国产算力替代叙事,非供货关系" },
  "NVDA->688256": { strength: "中", basis: "国产 AI 芯片替代,题材驱动" },
  "AMD->688041": { strength: "中", basis: "海光早期获 AMD x86 授权,业务有渊源" },
  "AMD->688256": { strength: "中", basis: "国产 GPU/AI 芯片对标" },
  "TSM->688981": { strength: "中", basis: "同业晶圆代工,国产替代,非供货" },
  "ASML->002371": { strength: "中", basis: "半导体设备国产替代,非供货" },
  "AMAT->002371": { strength: "中", basis: "半导体设备国产替代,非供货" },
  "LRCX->688012": { strength: "中", basis: "刻蚀设备国产替代,非供货" },
  "ANET->000063": { strength: "中", basis: "网络设备对标,国产替代" },
  "ANET->000938": { strength: "中", basis: "交换机对标,国产替代" },
  "CDNS->301269": { strength: "中", basis: "EDA 国产替代,非供货" },
  "SNPS->301269": { strength: "中", basis: "EDA 国产替代,非供货" },
  "INTC->688041": { strength: "中", basis: "x86 服务器 CPU 对标/替代" },

  // —— 弱:同主题 / 蹭概念,无直接业务绑定 ——
  "AVGO->000063": { strength: "弱", basis: "同属网络/算力主题,无直接供货" },
  "TSLA->002747": { strength: "弱", basis: "人形机器人主题映射,无直接业务" },
  "TSLA->300124": { strength: "弱", basis: "具身智能主题映射,无直接业务" },
  "PLTR->002230": { strength: "弱", basis: "AI 应用主题关联,无直接业务" },
  "ARM->603893": { strength: "弱", basis: "端侧 SoC 主题关联" },
  "ARM->688521": { strength: "弱", basis: "IP 授权主题关联" },
};

// 取一条边的强弱+依据。仅在一端为美股、另一端为 A 股时有意义。
export function edgeInfo(codeA: string, codeB: string): EdgeInfo | null {
  const a = STOCK_MAP[codeA];
  const b = STOCK_MAP[codeB];
  if (!a || !b) return null;
  // 必须是跨市场(美股↔A股)的边
  const us = a.market === "美股" ? codeA : b.market === "美股" ? codeB : null;
  const cn = a.market === "A股" ? codeA : b.market === "A股" ? codeB : null;
  if (!us || !cn) return null;

  const explicit = EDGES[`${us}->${cn}`];
  if (explicit) return explicit;

  // 派生:看 A 股端的 relationTypes
  const rt = (STOCK_MAP[cn]?.relationTypes ?? []) as readonly string[];
  if (rt.includes("产业链"))
    return { strength: "中", basis: "产业链配套梳理,非确认供货关系" };
  if (rt.includes("资本开支") || rt.includes("电力映射"))
    return { strength: "中", basis: "资本开支/电力需求传导" };
  return { strength: "弱", basis: "同属 AI 主题,无直接业务绑定" };
}

export const STRENGTH_BADGE: Record<Strength, string> = {
  强: "bg-rose-50 text-rose-700 ring-rose-600/20",
  中: "bg-amber-50 text-amber-700 ring-amber-600/20",
  弱: "bg-gray-100 text-gray-500 ring-gray-400/20",
};
