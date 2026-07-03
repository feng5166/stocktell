import { NextRequest, NextResponse } from "next/server";
import { isCronAuthorized } from "@/lib/api-guard";
import { isAshareTradingDay } from "@/lib/tushare";
import { todayISO } from "@/lib/date";
import { sendFeishu } from "@/lib/feishu";
import { alertCron } from "@/lib/monitor";
import { generateDailyInsight } from "@/lib/insight-pipeline/generate";
import { saveDraft, hasDaily, getPrevHeat } from "@/lib/insight-pipeline/docs";
import { CHAINS } from "@/data/chains";

export const dynamic = "force-dynamic";
// 判断+热力两段 LLM + 检索 + URL 实测,给足;独立 cron 不挤 07:01 主流程预算(PRD §5)
export const maxDuration = 120;

// 链级每日推理生成(07:05 北京;07:45 backup 幂等补跑同一入口)。
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
  // M1 只有 ai 配置了 segments;M1.5 加链自动进循环(PRD D4)
  for (const chain of Object.values(CHAINS)) {
    if (!chain.segments?.length) continue;
    try {
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
          `${date} ${chain.name} 每日推理被阻断:${r.guard!.blockers.join(";")} —— 未进审核队列,07:45 会补跑;连续阻断请查 prompt/数据`
        );
        continue;
      }
      const doc = await saveDraft(r.payload!, r.guard!);
      results[chain.id] = doc ? "draft-saved" : "no-db";
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
  return NextResponse.json({ ok: true, date, results });
}
