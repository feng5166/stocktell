import { NextRequest, NextResponse } from "next/server";
import { isAdminAuthorized } from "@/lib/api-guard";
import { generateDailyInsight } from "@/lib/insight-pipeline/generate";
import { getPrevHeat, saveDraft, publishDoc } from "@/lib/insight-pipeline/docs";
import { complianceBlockers } from "@/lib/insight-pipeline/guard";
import { CHAINS } from "@/data/chains";
import { todayISO } from "@/lib/date";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

// 回放 / dry-run(负责人拍板:先用历史日期数据压功能链路,替代不了 10 交易日生产验收)。
// 用指定 date 的已发布简报当输入,逐链生成草稿 + 跑护栏,【只返回,不落库 / 不发布 / 不发飞书】——
// 零污染今日生产数据。用途:验两链产出 / 护栏 / 禁词 / HIGH / references / chainId / 链边界。
// 用法:GET /api/admin/insight-replay?date=2026-07-02 (Bearer ADMIN_TOKEN)
export async function GET(req: NextRequest) {
  if (!isAdminAuthorized(req)) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }
  const date = req.nextUrl.searchParams.get("date") ?? todayISO();
  const publish = req.nextUrl.searchParams.get("publish") === "1"; // 真发布:走与 cron 完全相同的自动发布安全轨
  const out: Record<string, unknown>[] = [];
  for (const chain of Object.values(CHAINS).filter((c) => c.segments?.length)) {
    try {
      const prevHeat = await getPrevHeat(chain.id, date).catch(() => null);
      const r = await generateDailyInsight(chain.id, date, { yesterdayHeat: prevHeat });
      const p = r.payload;
      const entry: Record<string, unknown> = {
        chainId: chain.id,
        chainName: chain.name,
        ok: r.ok,
        reason: r.reason,
        blocked: r.blocked,
        blockers: r.guard?.blockers ?? [],
        warnings: r.guard?.warnings ?? [],
        confidence: p?.confidence,
        heatStreak: r.heatStreak,
        judgment: p?.judgment,
        heat: p?.heat.map((h) => `${h.segment}:${h.direction}/${h.relation}`),
        mappings: p?.mappingsDelta.map(
          (m) => `${m.name}[${m.code}] ${m.segment} · ${m.relation}`
        ),
        referencesCount: p?.references.length ?? 0,
        references: p?.references.map((rf) => ({ name: rf.name, verified: rf.verified })),
      };
      // publish=1:走 cron 同款安全轨(HIGH 已在生成侧挡;这里复检合规 + 退化不发)。落库并发布。
      if (publish && r.ok && !r.blocked && p) {
        const doc = await saveDraft(p, r.guard!);
        if (!doc) entry.publishStatus = "no-db";
        else {
          const degraded = (r.heatStreak ?? 1) >= 3;
          const holdReasons = degraded ? ["疑似退化(同图谱)"] : complianceBlockers(p);
          if (holdReasons.length === 0) {
            const pub = await publishDoc(doc.id).catch(() => null);
            entry.publishStatus = pub ? "auto-published" : "publish-failed";
            entry.docId = doc.id;
          } else entry.publishStatus = `held:${holdReasons.join(",")}`;
        }
      }
      out.push(entry);
    } catch (e) {
      out.push({ chainId: chain.id, chainName: chain.name, error: String(e) });
    }
  }
  return NextResponse.json({
    ok: true,
    mode: publish ? "replay-publish" : "replay-dryrun",
    date,
    note: publish
      ? "已走 cron 同款安全轨落库+自动发布(dated 该日期);替代不了 10 交易日生产验收"
      : "只生成不落库/不发布/不飞书;替代不了 10 交易日生产验收",
    chains: out,
  });
}
