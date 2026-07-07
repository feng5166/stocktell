// 简报状态标识(2026-07-05 首版;2026-07-07 负责人拍板 2.1-A:全站语义对齐 replay 五档口径)。
// 目的=生产透明度:让"美股休市""模板兜底""合规阻断""生成失败"四种「今天没有正常简报」区分开,
// 用户和告警消费方(watchdog/outcome/push-feishu)都据此判断,不再把非事故误报成事故。
//
// 五档口径(与 docs/pipeline-replay.md「状态口径」同源,唯一权威):
// - generated      正常 LLM 生成                       → 非事故,常规流程
// - fallback       LLM 失败但模板兜底成功              → 非事故但需关注:低置信,进人工审
// - blocked        合规 guard 阻断                     → 非事故,属正确阻断:不自动发布,人工处理
// - market_closed  美股休市,无新隔夜映射              → 非事故:不补发、不硬造
// - failed         行情源/数据底座/结构性地板故障      → 事故:告警 + 人工排查
// manual_reissue 为辅助档(人工补发动作的痕迹),不在五档语义内,展示按 generated 同级对待。
//
// 存储:复用 quotesCache KV(id=brief-status:{date}),零新表零迁移。
// 写入端(cron/generate)全部 fail-safe:状态写失败【绝不】影响简报生成/发布主流程。
import { getPrisma } from "@/lib/prisma";

export type BriefStatus =
  | "generated" // 正常 LLM 生成
  | "fallback" // LLM 失败,规则模板兜底成功(engine=template/低置信/进人工审)
  | "blocked" // 合规阻断,不自动发布,待人工处理
  | "market_closed" // 美股休市,无新隔夜映射(非失败)
  | "failed" // 地板故障:生成失败/异常,待人工核查
  | "manual_reissue"; // 人工补发(辅助档,兼容历史记录)

export type BriefStatusReason =
  | "us_market_closed"
  | "stale_asof"
  | "data_fetch_failed"
  | "llm_failed"
  | "compliance_blocked"
  | "manual_review_pending";

export type BriefStatusRecord = {
  status: BriefStatus;
  // market_closed 的子型(2.1-C):holiday_bridge=已发布「节后首日观察」(内容在
  // holiday-bridge KV),前台据此渲染 bridge 区块;无 subType 的 market_closed=纯休市标注。
  subType?: "holiday_bridge";
  reason?: BriefStatusReason;
  sourceAsOf?: string; // 隔夜映射所据的最近有效美股交易日
  fallbackFromDate?: string; // 回退/回顾内容所据的日期(holiday_bridge 的素材日)
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
// 色调铁律:只有 failed 才 warn(大红);fallback/blocked 是 attention(琥珀,需关注非事故);
// 真休市 neutral 中性色。别把非事故染成事故色——那是 2.0 告警层踩过的坑。
export const BRIEF_STATUS_UI: Record<
  BriefStatus,
  { badge: string; note: string; tone: "info" | "neutral" | "attention" | "warn" }
> = {
  generated: { badge: "已生成", note: "基于最近有效美股交易日与盘前事件。", tone: "info" },
  fallback: {
    badge: "模板兜底",
    note: "AI 生成暂不可用,本期由规则模板生成,置信度较低,已进入人工审阅。",
    tone: "attention",
  },
  blocked: {
    badge: "合规阻断",
    note: "本期内容触发合规护栏,未自动发布,待人工审阅处理。",
    tone: "attention",
  },
  market_closed: {
    badge: "美股休市",
    note: "今日无新的隔夜美股映射,展示最近交易日与周末关注内容。",
    tone: "neutral",
  },
  failed: { badge: "生成异常", note: "今日简报生成失败,已进入人工核查。", tone: "warn" },
  manual_reissue: { badge: "人工补发", note: "本期简报已人工补发。", tone: "info" },
};

// 告警分级(2.1-B):告警消费方(watchdog/outcome/push-feishu)按此决定发什么、发不发。
// - none:设计性无简报(休市)或正常产出 → 不告警、【不给补发指令】(休市不硬造=不变量#7)
// - notice:非事故但需人眼(模板兜底待人审 / 合规阻断待处理)→ 低优先级提示,不算事故
// - incident:地板故障或状态缺失(疑似共模故障)→ 高优先级 🚨 告警
export type AlertSeverity = "none" | "notice" | "incident";
export function briefAlertSeverity(rec: BriefStatusRecord | null): AlertSeverity {
  switch (rec?.status) {
    case "market_closed":
    case "generated":
    case "manual_reissue":
      return "none";
    case "fallback":
    case "blocked":
      return "notice";
    case "failed":
      return "incident";
    default:
      // 交易日 0 简报且连状态都没写:生成 cron 很可能根本没跑(Vercel cron 共模故障)→ 按事故报
      return "incident";
  }
}
