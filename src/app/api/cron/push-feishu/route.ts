import { NextRequest, NextResponse } from "next/server";
import { listBriefing } from "@/lib/briefings";
import { sendFeishu } from "@/lib/feishu";
import { todayISO, beijingHM } from "@/lib/date";
import { isCronAuthorized } from "@/lib/api-guard";
import { alertCron } from "@/lib/monitor";
import { ashareDayStatus } from "@/lib/tushare";
import {
  getBriefStatusChecked,
  briefAlertSeverity,
  feishuPendingNoticeText,
} from "@/lib/brief-status";

export const dynamic = "force-dynamic";

const DOT: Record<string, string> = { 高: "🔴", 中: "🟡", 低: "🟢" };

// 把当天已发布简报推一条到飞书(CRON_SECRET 鉴权;由 GitHub Actions 定时触发,北京约 07:10)。
// 本 cron 是 Vercel cron 共模盲区的【唯一外部哨】(GH Actions 跑,不与 Vercel 同生共死):
// 交易日缺简报时绝不静默 skip,按 brief-status × 上下文分级(review F4/F5 修订)——
// - 休市/阻断/兜底待审:按级提示,不喊补发;
// - failed 且早于 07:40:主跑失败≠最终失败,notice 等补位,【不给手动补发指令】
//   (抢跑指令会诱发人工与 07:40 自愈并发补发);
// - 交易日无状态记录:共模嫌疑,🚨+500(curl -f 打红 GH,第二通道)——这是外部哨的本职,
//   但注明"07:40 补位后恢复即为延迟误报";
// - 状态读失败(DB 抖动)/交易日未知(Tushare 挂):notice,交给 08:30 看门狗,不假 🚨。
export async function GET(req: NextRequest) {
  if (!isCronAuthorized(req)) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }
  try {
    const date = todayISO();
    // 三读相互独立,并行(review 小项④)
    const [items, dayStatus, statusRead] = await Promise.all([
      listBriefing({ date, status: "published" }),
      ashareDayStatus(date).catch(() => "unknown" as const),
      getBriefStatusChecked(date),
    ]);
    const brief = statusRead.rec;

    if (items.length === 0) {
      if (dayStatus === "closed") {
        return NextResponse.json({ ok: true, skipped: "non-trading-day", date });
      }
      // GH schedule 常延迟(今日实测 07:10 排程 08:16 触发),按实际北京时刻判断补位是否在途
      const beforeBackup = (beijingHM(new Date().toISOString()) ?? "23:59") < "07:40";
      const severity = briefAlertSeverity(brief, {
        publishedCount: 0,
        statusReadFailed: statusRead.readFailed,
        tradingDayUnknown: dayStatus === "unknown",
        beforeBackup,
      });
      if (severity === "none") {
        // 美股休市等设计性无简报:不告警。飞书侧的休市心跳由 08:30 watchdog 发,这里不重复。
        return NextResponse.json({ ok: true, skipped: brief!.status, date });
      }
      if (severity === "notice") {
        const msg = statusRead.readFailed
          ? `⚠️ StockTell 简报状态读取失败 · ${date} · DB 瞬时抖动,暂不判级,以 08:30 看门狗为准`
          : brief?.status === "failed"
            ? `⚠️ StockTell 简报主跑失败 · ${date} · 07:40 补位将自动重试,勿手动补发;最终结果以 08:30 看门狗为准`
            : brief
              ? feishuPendingNoticeText(brief, date)
              : `⚠️ StockTell 今日无简报且交易日未知 · ${date} · Tushare 日历不可用,可能为 A 股假日;以 08:30 看门狗为准`;
        const fs = await sendFeishu(msg);
        return NextResponse.json({ ok: true, notice: brief?.status ?? "unknown", date, feishu: fs });
      }
      // incident 三种成因分开说(二轮 N5:failed+0 条是【一致态】=生成失败,套"状态与库矛盾"
      // 模板会把值班引去查"谁删了简报";补发指令也要跟上,别让人等到 08:30 才拿到命令)。
      // 500 + workflow curl -f → GH 打红,双通道。
      await alertCron(
        "push-feishu(飞书推送)",
        brief?.status === "failed"
          ? `交易日 ${date} 简报生成失败(主跑+07:40 补位均未产出,状态=failed)。请手动补:POST /api/briefing/generate?replace=1&llm=1(Bearer ADMIN_TOKEN)${brief.message ? `\n${brief.message}` : ""}`
          : brief
            ? `交易日 ${date} 状态=${brief.status} 但 0 条已发布(状态与库矛盾:疑似发布后被清空/写入中断),需人工核查 /admin/briefing`
            : `交易日 ${date} 推送时无已发布简报且无状态记录 —— 疑似 Vercel cron 共模故障(生成 cron 未跑)。请查 Vercel cron;若 07:40 补位后恢复,此为延迟误报,勿手动补发`
      );
      return NextResponse.json(
        { ok: false, error: "briefing-missing-on-trading-day", date, briefStatus: brief?.status ?? null },
        { status: 500 }
      );
    }
    // 简报在但是模板兜底:推送照常(用户侧内容在线),标题带低置信标记,与"全真"区分。
    const fallbackTag = brief?.status === "fallback" ? "(模板兜底·低置信)" : "";
    const lines = [`📊 StockTell 今日简报${fallbackTag} | ${date}`, ""];
    for (const it of items.slice(0, 8)) {
      lines.push(`${DOT[it.impact] ?? ""} ${it.title}`);
      if (it.beneficiaries.length) {
        lines.push(`   → ${it.beneficiaries.map((b) => b.name).join(" / ")}`);
      }
    }
    lines.push("", "—", "StockTell · 不构成投资建议");
    lines.push("https://www.maoadao.com");

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
