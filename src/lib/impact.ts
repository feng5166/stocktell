// 影响等级(高/中/低)统一映射:emoji / 文案 / 卡片描边 / 色块 class。
// 此前散在 BriefingFeed(IMPACT_META)、track(IMPACT_DOT emoji)、admin(IMPACT_DOT 色块)三处且不一致。
import type { Impact } from "@/lib/briefings";

export const IMPACT_META: Record<
  Impact,
  {
    emoji: string;
    label: string;
    ring: string;
    dotClass: string;
    barClass: string; // 卡片左侧色条
    tagClass: string; // 描边小标签(不填色)
  }
> = {
  高: {
    emoji: "🔴",
    label: "高影响",
    ring: "border-rose-200",
    dotClass: "bg-rose-500",
    barClass: "border-l-rose-300",
    tagClass: "bg-rose-50 text-rose-600", // 扁平徽章:浅填充+彩字,无描边
  },
  中: {
    emoji: "🟡",
    label: "中影响",
    ring: "border-amber-200",
    dotClass: "bg-amber-500",
    barClass: "border-l-amber-300",
    tagClass: "bg-amber-50 text-amber-700",
  },
  低: {
    emoji: "🟢",
    label: "低影响",
    ring: "border-emerald-200",
    dotClass: "bg-emerald-500",
    barClass: "border-l-emerald-300",
    tagClass: "bg-emerald-50 text-emerald-600",
  },
};
