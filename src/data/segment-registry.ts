// 环节标准 registry(负责人 2026-07-04 观察期拍板 #3:固化 segment enum,防"每票自造环节名")。
// 规则:新增关系的 segment 必须从这里选;不在册的 segment 进 reviewQueue(lint 会拦);alias 只用于归并、不上前台。
// 电力链已归并到 8 标准(见 DC_POWER_SEGMENTS)。ai-infra 侧仍有 2 对近义待后续归并(标 TODO,观察期不动模型)。
import { DC_POWER_SEGMENTS } from "./chain-relations";

export const AI_INFRA_SEGMENTS = [
  // 推理基础设施核心
  "光模块/高速互连",
  "服务器/算力代工",
  "国产算力芯片",
  "服务器内存接口/DDR5",
  "存储代理(HBM影子)",
  "先进封装/封测",
  "液冷/温控",
  "铜连接/高速互连",
  "铜连接/高速互连(铜)", // TODO(alias→"铜连接/高速互连"):神宇股份,待后续归并
  "数据中心电力", // TODO(ai-infra 侧电力 overlap,待归并):盛弘/科士达 的 ai-infra indirect
  "数据中心电力/发电", // TODO(同上):东方电气 的 ai-infra indirect
  // AI 应用侧(挂 ai-infra,与推理核心区分)
  "办公 / 生产力 AI",
  "金融信息 AI",
  "语音 / 多模态 AI",
  "大模型 / AIGC 平台",
  "安全 / 垂直 AI",
  "端侧 AI 软件",
] as const;

export const TRIGGER_SEGMENT = "海外事件触发源"; // trigger 伪环节(不进前台环节筛选)

export const SEGMENT_REGISTRY: Record<string, readonly string[]> = {
  "ai-infra": AI_INFRA_SEGMENTS,
  "data-center-power": DC_POWER_SEGMENTS,
};

export const KNOWN_SEGMENTS = new Set<string>([...AI_INFRA_SEGMENTS, ...DC_POWER_SEGMENTS, TRIGGER_SEGMENT]);

// 某链下 segment 是否在册(trigger 伪环节全链通用)
export function isKnownSegment(chainId: string, segment: string): boolean {
  if (segment === TRIGGER_SEGMENT) return true;
  return SEGMENT_REGISTRY[chainId]?.includes(segment) ?? false;
}
