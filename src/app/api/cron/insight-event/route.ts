import { NextRequest, NextResponse } from "next/server";
import { SITE_URL } from "@/lib/site";
import { isCronAuthorized } from "@/lib/api-guard";
import { isAshareTradingDay } from "@/lib/tushare";
import { todayISO } from "@/lib/date";
import { sendFeishu } from "@/lib/feishu";
import { alertCron } from "@/lib/monitor";
import { listBriefing } from "@/lib/briefings";
import { detectEventCandidates, generateEventInsight } from "@/lib/insight-pipeline/event";
import { saveEventDraft, hasEventDoc } from "@/lib/insight-pipeline/docs";

export const dynamic = "force-dynamic";
export const maxDuration = 300; // 单篇≈单链 daily 成本(~113s 最坏);cap=2 篇串行在预算内

// 事件专篇生成(M2,PRD prd-2.3-iteration-review §2)。vercel.json cron 20 23 UTC=北京 07:20,
// 排在 07:07 insight-daily 之后(共用当日已发布条目,不抢同一窗口的函数预算)。
// 流程:D3 触发检测 → 复用 daily 五段生成(itemsOverride)→ 护栏 → draft 落库 → 飞书待审。
// 【全审,无自动发布】(D2 口径延伸:事件专篇含新映射概率高)——与 daily 的自动发布轨不同。
export async function GET(req: NextRequest) {
  if (!isCronAuthorized(req)) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }
  const date = todayISO();
  if (!(await isAshareTradingDay(date))) {
    return NextResponse.json({ ok: true, skipped: "non-trading-day", date });
  }

  const items = await listBriefing({ date, status: "published" }).catch(() => []);
  if (items.length === 0) {
    return NextResponse.json({ ok: true, skipped: "no-briefing-items", date });
  }

  const candidates = detectEventCandidates(items, date);
  const results: Record<string, string> = {};
  const startedAt = Date.now();
  const WORST_MS = 120_000;
  const BUDGET_MS = 300_000 - 15_000;

  for (const cand of candidates) {
    if (Date.now() - startedAt > BUDGET_MS - WORST_MS) {
      results[cand.slug] = "skip:time-budget";
      continue;
    }
    try {
      if (await hasEventDoc(cand.slug)) {
        results[cand.slug] = "already-exists";
        continue;
      }
      const r = await generateEventInsight(cand, date);
      if (!r.ok) {
        results[cand.slug] = `skip:${r.reason}`;
        continue;
      }
      if (r.blocked) {
        results[cand.slug] = "blocked";
        await alertCron(
          "insight-event(护栏阻断)",
          `${date} 事件专篇「${cand.meta.title}」被阻断:${r.guard!.blockers.join(";")} —— 未进审核队列`
        );
        continue;
      }
      const doc = await saveEventDraft(cand.slug, r.payload!, r.guard!);
      if (!doc) {
        results[cand.slug] = "no-db";
        continue;
      }
      results[cand.slug] = "draft";
      const p = r.payload!;
      const warn = r.guard!.warnings.length ? `⚠️ ${r.guard!.warnings.length} 项警告` : "✅ 护栏全过";
      const hits = p.mappingsDelta.slice(0, 4).map((m) => `${m.name}(${m.relation})`).join("、");
      const base = process.env.NEXTAUTH_URL ?? SITE_URL;
      await sendFeishu(
        `📰 ${date} 事件专篇待审(全审轨,不自动发布)\n` +
          `📌 ${cand.meta.title}\n` +
          `💡 ${p.judgment.slice(0, 60)}\n` +
          `📊 命中 ${p.mappingsDelta.length} 只:${hits || "—"} · references ${p.references.length} 条\n` +
          `🛡️ ${warn}\n` +
          `请人审:${base}/admin/insights`
      );
    } catch (e) {
      results[cand.slug] = "error";
      await alertCron("insight-event(生成)", e);
    }
  }
  return NextResponse.json({ ok: true, date, candidates: candidates.length, results });
}
