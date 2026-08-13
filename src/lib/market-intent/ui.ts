// Market Intent 展示层常量(2.2.3)。零依赖(仅 type import),server/client 皆可 import。
// 展示铁律(负责人):结论 → 证据 → 反证 → 失效条件,四段缺一不可,否则退化成盘口软件。
import type { IntentConfidence, IntentType } from "./types";

export const CONFIDENCE_LABEL: Record<IntentConfidence, string> = {
  high: "较高置信度",
  medium: "中等置信度",
  low: "低置信度",
};

// 意图 chip 配色(与关系档 chip 同风格;出货/派发暖色示警,吸筹冷色,中性灰)。
export const INTENT_CHIP_CLS: Record<IntentType, string> = {
  accumulation: "bg-emerald-100 text-emerald-700",
  rush: "bg-rose-100 text-rose-700",
  wash: "bg-sky-100 text-sky-700",
  distribution: "bg-amber-100 text-amber-700",
  exit: "bg-red-100 text-red-700",
  divergence: "bg-indigo-100 text-indigo-700",
  exhaustion: "bg-orange-100 text-orange-700",
  neutral: "bg-gray-100 text-gray-500",
};

// 信息量排序(首页链级聚合取最有信息量的板块意图;数值小 = 优先展示)。
export const INTENT_SEVERITY: Record<IntentType, number> = {
  exit: 0,
  distribution: 1,
  rush: 2,
  accumulation: 3,
  wash: 4,
  exhaustion: 5,
  divergence: 6,
  neutral: 7,
};

// 免责口径(三边界的用户侧表述;段落级展示一次)
export const INTENT_DISCLAIMER =
  "基于公开资金流数据的规则化特征识别,不代表真实主力账户意图;资金行为不等于基本面验证,也不预示后续涨跌;不构成投资建议。";

export const fmtYmd = (ymd: string) => `${Number(ymd.slice(4, 6))}/${Number(ymd.slice(6, 8))}`;
export const fmtYi = (v: number) => `${v > 0 ? "+" : ""}${Math.round(v * 10) / 10}亿`;
