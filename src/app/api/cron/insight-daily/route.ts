import { NextRequest, NextResponse } from "next/server";
import { isCronAuthorized } from "@/lib/api-guard";
import { isAshareTradingDay } from "@/lib/tushare";
import { todayISO } from "@/lib/date";
import { sendFeishu } from "@/lib/feishu";
import { alertCron } from "@/lib/monitor";
import { generateDailyInsight } from "@/lib/insight-pipeline/generate";
import { saveDraft, hasDaily, getPrevHeat, isPipelinePaused, pausePipeline } from "@/lib/insight-pipeline/docs";
import { CHAINS } from "@/data/chains";

export const dynamic = "force-dynamic";
// 判断+热力两段 LLM + 检索 + URL 实测,给足;独立 cron 不挤 07:01 主流程预算(PRD §5)
export const maxDuration = 300; // B2-3:两段LLM+检索+URL实测,单链最坏~113s;多链串行须覆盖 2×单链

// 链级每日推理生成(07:05 北京;07:40 briefing-backup 兜底补跑同一入口)。
// 流程:读当日已发布条目 → 五段生成 → 护栏 → draft 落库 → 飞书待审。
// 阻断型护栏不过 = 弃+告警不进审;人审未完成时页面自动走地板内容(拍板 D5)。
export async function GET(req: NextRequest) {
  if (!isCronAuthorized(req)) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }
  const date = todayISO();
  if (!(await isAshareTradingDay(date))) {
    return NextResponse.json({ ok: true, skipped: "non-trading-day", date });
  }

  const results: Record<string, string> = {};
  // B2-3:多链串行的时间预算闸门。单链最坏 ~113s;剩余不够跑完一条就 break 交 07:40 补跑,
  // 并告警——避免被 300s 硬杀在循环中段、剩下的链"无草稿无告警"静默断产。
  const startedAt = Date.now();
  const WORST_CHAIN_MS = 120_000;
  const BUDGET_MS = 300_000 - 15_000; // 留 15s 收尾余量
  // M1 只有 ai 配置了 segments;M1.5 加链自动进循环(PRD D4)
  const configured = Object.values(CHAINS).filter((c) => c.segments?.length);
  for (const chain of configured) {
    if (Date.now() - startedAt > BUDGET_MS - WORST_CHAIN_MS) {
      results[chain.id] = "skip:time-budget";
      continue; // 不 break:把剩余链都标注,循环末尾统一告警点名
    }
    try {
      // 同图谱连续告警未处理 → 管线暂停(§7.2-6):跳过生成,等人工 force 恢复。
      // #13:已暂停是"已知态",不每天飞书刷屏(暂停当天已在 streak≥3 分支告过一次);
      // 这里只记日志,08:30 看门狗仍会兜"无当日草稿"告警,不会漏。
      const paused = await isPipelinePaused(chain.id);
      if (paused) {
        results[chain.id] = "paused";
        console.log(`[insight-daily] ${chain.id} paused(${paused}),skip;force=1 恢复`);
        continue;
      }
      if (await hasDaily(chain.id, date)) {
        results[chain.id] = "already-exists";
        continue;
      }
      const prevHeat = await getPrevHeat(chain.id, date).catch(() => null);
      const r = await generateDailyInsight(chain.id, date, { yesterdayHeat: prevHeat });
      if (!r.ok) {
        results[chain.id] = `skip:${r.reason}`;
        continue;
      }
      if (r.blocked) {
        results[chain.id] = "blocked";
        await alertCron(
          "insight-daily(护栏阻断)",
          `${date} ${chain.name} 每日推理被阻断:${r.guard!.blockers.join(";")} —— 未进审核队列,07:40 补位会重试;连续阻断请查 prompt/数据`
        );
        continue;
      }
      const doc = await saveDraft(r.payload!, r.guard!);
      results[chain.id] = doc ? "draft-saved" : "no-db";
      // 同图谱连续 3 天零变化 → 设暂停标记 + 升级告警(草稿仍落库供人审判断)
      if ((r.heatStreak ?? 1) >= 3) {
        await pausePipeline(chain.id, `连续 ${r.heatStreak} 天热力零变化(${date})`);
        await alertCron(
          "insight-daily(同图谱暂停)",
          `${date} ${chain.name} 连续 ${r.heatStreak} 天热力方向零变化,疑似退化成预制图谱 → 管线已暂停。若为真实连续行情,确认后 POST /api/admin/insight-daily?force=1&chain=${chain.id} 恢复`
        );
      }
      if (doc) {
        const warn = r.guard!.warnings.length
          ? `⚠️ ${r.guard!.warnings.length} 项警告`
          : "护栏全过";
        const base = process.env.NEXTAUTH_URL ?? "https://www.stocktell.me";
        await sendFeishu(
          `📋 ${date} ${chain.name}每日推理待审 · ${warn}\n「${r.payload!.judgment.slice(0, 48)}…」\n审核:${base}/admin/insights`
        );
      }
    } catch (e) {
      results[chain.id] = "error";
      await alertCron("insight-daily(生成)", e);
    }
  }
  // B2-3:循环末尾核对——被时间预算跳过的链点名告警,不让它静默(07:40 补跑会重试)
  const budgetSkipped = configured.filter((c) => results[c.id] === "skip:time-budget");
  if (budgetSkipped.length) {
    await alertCron(
      "insight-daily(时间预算跳过)",
      `${date} 时间预算不足,跳过 ${budgetSkipped.map((c) => c.name).join("、")}(未生成草稿);07:40 补跑会重试,连续跳过请拆分链或提高并发`
    );
  }
  return NextResponse.json({ ok: true, date, results });
}
