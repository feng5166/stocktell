// 简报状态标识(2026-07-05 负责人拍板,2.0 收尾小补丁·最小闭环)。
// 目的=生产透明度:让"美股休市无新简报"和"生成失败"区分开,用户不把休市缺口误判成系统漏跑。
// 【不是】2.1 的"节后首日简报"增强——现在只标状态,不硬造内容。
//
// 存储:复用 quotesCache KV(id=brief-status:{date}),零新表零迁移。
// 写入端(cron/generate)全部 fail-safe:状态写失败【绝不】影响简报生成/发布主流程。
import { getPrisma } from "@/lib/prisma";

export type BriefStatus =
  | "generated" // 正常生成
  | "market_closed" // 美股休市,无新隔夜映射(非失败)
  | "fallback" // 展示回退内容
  | "failed" // 生成失败/异常,待人工核查
  | "manual_reissue"; // 人工补发

export type BriefStatusReason =
  | "us_market_closed"
  | "stale_asof"
  | "data_fetch_failed"
  | "llm_failed"
  | "compliance_blocked"
  | "manual_review_pending";

export type BriefStatusRecord = {
  status: BriefStatus;
  reason?: BriefStatusReason;
  sourceAsOf?: string; // 隔夜映射所据的最近有效美股交易日
  fallbackFromDate?: string; // 首页展示回退内容时,回退到的日期
  message?: string;
  at?: string; // 写入时间(由写入方传,脚本环境无 Date.now 时可省)
};

const KEY = (date: string) => `brief-status:${date}`;

// 写状态(fail-safe:catch 内吞,绝不 throw、绝不影响调用方主流程)。
export async function setBriefStatus(date: string, rec: BriefStatusRecord): Promise<void> {
  const db = getPrisma();
  if (!db) return;
  await db.quotesCache
    .upsert({
      where: { id: KEY(date) },
      create: { id: KEY(date), data: rec as object },
      update: { data: rec as object },
    })
    .catch(() => {});
}

export async function getBriefStatus(date: string): Promise<BriefStatusRecord | null> {
  const db = getPrisma();
  if (!db) return null;
  const row = await db.quotesCache.findUnique({ where: { id: KEY(date) } }).catch(() => null);
  return (row?.data as BriefStatusRecord | undefined) ?? null;
}

// 前台展示映射:status → 徽章 + 一行小字 + 色调。
// 关键:真休市【不是事故】→ neutral 中性色,不大红;只有 failed 才 warn。
export const BRIEF_STATUS_UI: Record<
  BriefStatus,
  { badge: string; note: string; tone: "info" | "neutral" | "warn" }
> = {
  generated: { badge: "已生成", note: "基于最近有效美股交易日与盘前事件。", tone: "info" },
  market_closed: {
    badge: "美股休市",
    note: "今日无新的隔夜美股映射,展示最近交易日与周末关注内容。",
    tone: "neutral",
  },
  fallback: { badge: "回退展示", note: "展示最近交易日与周末关注内容。", tone: "neutral" },
  failed: { badge: "生成异常", note: "今日简报生成失败,已进入人工核查。", tone: "warn" },
  manual_reissue: { badge: "人工补发", note: "本期简报已人工补发。", tone: "info" },
};
