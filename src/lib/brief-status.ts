// 简报状态标识(2026-07-05 首版;2026-07-07 负责人拍板 2.1-A:全站语义对齐 replay 五档口径;
// 同日 review 修订:告警分级从「只看 status 字符串」升级为「status × 上下文」——见 briefAlertSeverity)。
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
// 存储:复用 quotesCache KV(id=brief-status:{date},读写走 lib/kv.ts)。
// 写入端(cron/generate)全部 fail-safe:状态写失败【绝不】影响简报生成/发布主流程。
import { kvGet, kvGetChecked, kvSet } from "@/lib/kv";

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

// 写状态(fail-safe:绝不 throw、绝不影响调用方主流程)。
export async function setBriefStatus(date: string, rec: BriefStatusRecord): Promise<void> {
  await kvSet(KEY(date), rec as object);
}

// 展示用读(首页/admin/API):读失败静默当 null,页面自己有兜底。
export async function getBriefStatus(date: string): Promise<BriefStatusRecord | null> {
  return kvGet<BriefStatusRecord>(KEY(date));
}

// 告警消费方用读(review F5):区分「记录不存在」(可能是共模故障信号)和「读失败」
// (DB 抖动,不该假 🚨)。瞬态错误内部先重试。
export async function getBriefStatusChecked(
  date: string
): Promise<{ rec: BriefStatusRecord | null; readFailed: boolean }> {
  const r = await kvGetChecked<BriefStatusRecord>(KEY(date), "brief-status:checked");
  return { rec: r.value, readFailed: r.readFailed };
}

// 前台展示映射:status → 徽章 + 一行小字 + 色调。
// 色调铁律:只有 failed 才 warn(大红);fallback/blocked 是 attention(琥珀,需关注非事故);
// 真休市 neutral 中性色。别把非事故染成事故色——那是 2.0 告警层踩过的坑。
export type BriefTone = "info" | "neutral" | "attention" | "warn";
export const BRIEF_STATUS_UI: Record<
  BriefStatus,
  { badge: string; note: string; tone: BriefTone }
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

// 告警分级(2.1-B;review F2/F4/F5 修订:只看 status 字符串会把不一致态误判成"无需告警",
// 把补位在途的主跑失败误判成事故——分级必须吃上下文)。
// - none:设计性无简报(休市)或状态与库一致的正常产出 → 不告警、不给补发指令
// - notice:非事故但需人眼/暂无法判级 → 低优先级提示,不算事故,不给手动补发指令
// - incident:地板故障、状态与实际矛盾、或交易日状态缺失(共模嫌疑)→ 高优先级 🚨
export type AlertSeverity = "none" | "notice" | "incident";
export type BriefAlertContext = {
  publishedCount: number; // 当日已发布简报条数(状态说"有"而库里 0 条=不一致态,是事故)
  statusReadFailed?: boolean; // 状态读失败(≠不存在):DB 抖动,不判级,交给下一道哨兵
  tradingDayUnknown?: boolean; // 交易日无法确认(Tushare 日历挂):null 状态可能只是 A 股假日
  beforeBackup?: boolean; // 当前早于 07:40 补位:failed=主跑失败≠最终失败
};
export function briefAlertSeverity(
  rec: BriefStatusRecord | null,
  ctx: BriefAlertContext
): AlertSeverity {
  if (ctx.statusReadFailed) return "notice"; // 读挂了什么也证明不了,别按"无状态"报共模
  switch (rec?.status) {
    case "market_closed":
      return "none"; // 设计性无简报(0 条即一致)
    case "blocked":
      return "notice"; // 正确阻断,0 条即一致,待人工
    case "generated":
    case "manual_reissue":
      // 状态说"已生成/已补发"但库里 0 条=不一致态(replace 删完写挂/人工全下架)→ 事故。
      // 旧版无条件 0 条告警恰好网住这类,分级化时不能丢(review F2)。
      return ctx.publishedCount > 0 ? "none" : "incident";
    case "fallback":
      return ctx.publishedCount > 0 ? "notice" : "incident"; // 兜底也该有条目,0 条同为不一致态
    case "failed":
      // 07:40 前=主跑失败,补位在途,notice 即可(review F4:别抢在补位前喊人手动补发);
      // 07:40 后仍 failed=补位也没救回,事故。
      return ctx.beforeBackup ? "notice" : "incident";
    default:
      // 交易日 0 简报且无状态记录:生成 cron 疑似根本没跑(Vercel cron 共模)→ 事故。
      // 但 Tushare 日历不可用时无法排除"其实是 A 股假日"(briefing cron 在闸门就退出、
      // 不写状态),降 notice(review F5 路径A)。
      return ctx.tradingDayUnknown ? "notice" : "incident";
  }
}

// 飞书「待人工处理」提示文案(review 小项③:push-feishu 与 watchdog 此前各写一份已开始漂移)。
export function feishuPendingNoticeText(rec: BriefStatusRecord, date: string): string {
  const ui = BRIEF_STATUS_UI[rec.status];
  return `⚠️ StockTell 今日简报待人工处理(${ui.badge}) · ${date} · ${ui.note}${rec.message ? `\n${rec.message}` : ""}`;
}
