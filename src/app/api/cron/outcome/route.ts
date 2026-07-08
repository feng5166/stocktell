import { NextRequest, NextResponse } from "next/server";
import { recordOutcomes, catchUpMissedOutcomes } from "@/lib/outcomes";
import { todayISO } from "@/lib/date";
import { isCronAuthorized } from "@/lib/api-guard";
import { alertCron } from "@/lib/monitor";
import { tradingDayGate } from "@/lib/trading-gate";
import { getBriefStatusChecked, briefAlertSeverity } from "@/lib/brief-status";
import { feedReviewQueueFromOutcomes } from "@/lib/relation-review";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// A 股收盘后跑:把当天简报的受益股实际表现记账,供 /track 查账。
export async function GET(req: NextRequest) {
  // 鉴权:Vercel cron 带 Authorization: Bearer ${CRON_SECRET}
  if (!isCronAuthorized(req)) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  // 只在 A 股交易日记账(fail-closed;unknown 跳过并告警)。dedupe=false:15:30 与盘前不同时段、
  // 不同关切(战绩数据),自己独立告警,不被盘前的当日去重压掉。
  const date = todayISO();

  // 自愈回看(2026-07-08):先补历史欠账——近 5 日内「有简报+交易日+零记录」的日子自动补记。
  // 放在今日闸门【之前】:今天即使因日历不可用跳过,历史欠账照样收敛;成功补记发 notice 飞书
  // (让负责人知道自愈发生了,不再需要人工 backfill)。fail-safe:自愈失败不影响今日主流程。
  const healRes = await catchUpMissedOutcomes(date).catch(() => null);
  if (healRes && healRes.healed.length > 0) {
    const lines = healRes.healed.map((h) => `${h.date}(${h.judged}/${h.evaluated} 判定)`);
    await alertCron("outcome 自愈补记", `✅ 已自动补记漏账:${lines.join("、")}——无需人工 backfill`).catch(() => null);
  }

  const gate = await tradingDayGate(date, "outcome(收盘记账)", {
    onUnknown: "skip",
    recoveryHint: `17:30 二次班次与次日回看会自动补记;急可手动 /api/admin/backfill-outcomes?date=${date}`,
  });
  if (gate) return NextResponse.json({ ok: true, ...gate, healed: healRes?.healed ?? [] });

  try {
    // 17:30 二次班次幂等:15:30 已记过(count>0)就不重跑判定与告警链,只做上面的自愈回看
    const { getPrisma } = await import("@/lib/prisma");
    const already = await getPrisma()?.briefingOutcome
      .count({ where: { date, isBacktest: false } })
      .catch(() => 0);
    if ((already ?? 0) > 0) {
      return NextResponse.json({ date, ok: true, skipped: "already-recorded", healed: healRes?.healed ?? [] });
    }
    const res = await recordOutcomes(date);
    // 交易日却没简报可记:先读 brief-status 分级(2.1-B)——美股休市等设计性无简报是【正常】,
    // 0 简报本来就无账可记,绝不能喊"需补发"(2026-07-06 休市交易日误报实录:补发指令是误导,勿照做)。
    // 只有 failed / 状态缺失(疑似早盘 cron 静默没跑)才是事故,15:30 这里是第二道网。
    if (res.skipped === "no-briefing") {
      const { rec: brief, readFailed } = await getBriefStatusChecked(date);
      const severity = briefAlertSeverity(brief, {
        publishedCount: 0, // recordOutcomes 返回 no-briefing 即当日 0 条已发布
        statusReadFailed: readFailed,
        beforeBackup: false, // 15:30 跑,早间补位早已结束
      });
      if (severity === "incident") {
        await alertCron(
          "outcome(记账)",
          `交易日 ${date} 收盘记账时无已发布简报(${brief ? `状态=${brief.status}` : "且无状态记录"})—— 当天早盘简报很可能没发出来,需补发并用 /api/admin/backfill-outcomes?date=${date} 补回查账`
        );
      }
      // none(休市)/notice(阻断待审):设计性或已知待人工,早间 watchdog 已按级提示过,这里不重复告警
      return NextResponse.json({ date, ...res, briefStatus: brief?.status ?? null });
    }
    // 判定率异常低:大多数受益股拿不到当日有效行情(源全挂 → quotes 空、缺 q;或源漂移 → asOf≠当日),
    // 当天战绩几乎全 null,但 evaluated>0 会显得"记了" → 必须告警,否则静默缺一天(评审确认的回归)。
    // 用 judged 分母而非只看 staleSkipped——后者漏了"quotes 完全为空"这种全缺价的情况。
    const evaluated = res.evaluated ?? 0;
    const judged = res.judged ?? 0;
    if (evaluated > 3 && judged < evaluated * 0.5) {
      await alertCron(
        "outcome(记账)",
        `交易日 ${date} 记账仅判定 ${judged}/${evaluated} 只(其中 asOf 不匹配 ${res.staleSkipped ?? 0} 只)—— 疑似行情源全挂/漂移或大面积停牌,当天战绩几乎未判定。请核查行情源并 backfill-outcomes?date=${date} 重记`
      );
    }
    // 复盘 → reviewQueue(2.1-W3):高频未验证的关系推给人工复核(admin/relation-review)。
    // fail-safe:队列坏了不连累记账;不飞书——队列刷屏=没人看,admin 页可见即可。
    // 不变量#4:这里【只入队】,绝不改 staticRelations。
    const review = await feedReviewQueueFromOutcomes(date).catch(() => null);
    return NextResponse.json({ date, ...res, review, healed: healRes?.healed ?? [] });
  } catch (e) {
    await alertCron("outcome(记账)", e);
    return NextResponse.json({ ok: false, error: String(e) }, { status: 500 });
  }
}
