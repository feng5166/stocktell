import { NextRequest, NextResponse } from "next/server";
import { listBriefing } from "@/lib/briefings";
import { sendFeishu } from "@/lib/feishu";
import { todayISO } from "@/lib/date";
import { isCronAuthorized } from "@/lib/api-guard";
import { alertCron } from "@/lib/monitor";
import { tradingDayGate } from "@/lib/trading-gate";
import { getBriefStatus, briefAlertSeverity, BRIEF_STATUS_UI } from "@/lib/brief-status";

export const dynamic = "force-dynamic";

const DOT: Record<string, string> = { 高: "🔴", 中: "🟡", 低: "🟢" };

// 把当天已发布简报推一条到飞书(CRON_SECRET 鉴权;由 GitHub Actions 定时触发)。
// 本 cron 是 Vercel cron 共模盲区的【唯一外部哨】(GH Actions 跑,不与 Vercel 同生共死):
// 交易日缺简报时绝不静默 skip(2.1-B 修复的残口),按 brief-status 分级——
// 休市=设计性不告警;兜底/阻断=低优提示;failed/无状态=🚨 且返回 500(配合 workflow curl -f
// 把 GH run 打红,邮件成为飞书之外的第二通道)。
export async function GET(req: NextRequest) {
  if (!isCronAuthorized(req)) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }
  try {
    const date = todayISO();
    const items = await listBriefing({ date, status: "published" });
    if (items.length === 0) {
      // 周末/确认节假日:本来就没简报,静默跳过。交付型 onUnknown=proceed(与 push-weixin 同,
      // Tushare 抖动不该让外部哨自己哑火)。
      const gate = await tradingDayGate(date, "push-feishu(飞书推送)", { onUnknown: "proceed" });
      if (gate) return NextResponse.json({ ok: true, ...gate });

      const brief = await getBriefStatus(date).catch(() => null);
      const severity = briefAlertSeverity(brief);
      if (severity === "none") {
        // 美股休市等设计性无简报:不告警、不硬造。飞书侧的休市心跳由 08:30 watchdog 发,这里不重复。
        return NextResponse.json({ ok: true, skipped: brief!.status, date });
      }
      if (severity === "notice") {
        const ui = BRIEF_STATUS_UI[brief!.status];
        const fs = await sendFeishu(
          `⚠️ StockTell 今日简报待人工处理(${ui.badge}) · ${date} · ${ui.note}`
        );
        return NextResponse.json({ ok: true, notice: brief!.status, date, feishu: fs });
      }
      // incident:failed 或交易日连状态都没有(Vercel cron 疑似共模故障——正是外部哨要抓的)。
      await alertCron(
        "push-feishu(飞书推送)",
        `交易日 ${date} 推送时无已发布简报(${brief ? `状态=${brief.status}` : "且无状态记录,疑似 Vercel cron 共模故障"})。请查 /api/cron/briefing 与 Vercel cron,必要时手动补:POST /api/briefing/generate?replace=1&llm=1`
      );
      // 500 + workflow curl -f → GH Actions 打红发失败邮件,双通道
      return NextResponse.json(
        { ok: false, error: "briefing-missing-on-trading-day", date, briefStatus: brief?.status ?? null },
        { status: 500 }
      );
    }
    // 简报在但是模板兜底:推送照常(用户侧内容在线),标题带低置信标记,与"全真"区分。
    const brief = await getBriefStatus(date).catch(() => null);
    const fallbackTag = brief?.status === "fallback" ? "(模板兜底·低置信)" : "";
    const lines = [`📊 StockTell 今日简报${fallbackTag} | ${date}`, ""];
    for (const it of items.slice(0, 8)) {
      lines.push(`${DOT[it.impact] ?? ""} ${it.title}`);
      if (it.beneficiaries.length) {
        lines.push(`   → ${it.beneficiaries.map((b) => b.name).join(" / ")}`);
      }
    }
    lines.push("", "—", "StockTell · 不构成投资建议");
    lines.push("https://stocktell.me");

    const res = await sendFeishu(lines.join("\n"));
    return NextResponse.json({
      ok: res.ok,
      date,
      pushed: res.ok ? items.length : 0,
      feishu: res, // 真实发送结果(ok/error),不再静默返回 pushed
    });
  } catch (e) {
    await alertCron("push-feishu(飞书推送)", e);
    return NextResponse.json({ ok: false, error: String(e) }, { status: 500 });
  }
}
