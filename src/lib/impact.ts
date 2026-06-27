// 影响等级(高/中/低)统一映射:emoji / 文案 / 卡片描边 / 色块 class。
// 此前散在 BriefingFeed(IMPACT_META)、track(IMPACT_DOT emoji)、admin(IMPACT_DOT 色块)三处且不一致。
import type { Impact } from "@/lib/briefings";

export const IMPACT_META: Record<
  Impact,
  { emoji: string; label: string; ring: string; dotClass: string }
> = {
  高: { emoji: "🔴", label: "高影响", ring: "border-rose-200", dotClass: "bg-rose-500" },
  中: { emoji: "🟡", label: "中影响", ring: "border-amber-200", dotClass: "bg-amber-500" },
  低: { emoji: "🟢", label: "低影响", ring: "border-emerald-200", dotClass: "bg-emerald-500" },
};
