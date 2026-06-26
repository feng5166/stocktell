import { NextRequest, NextResponse } from "next/server";
import { generateDrafts, todayISO } from "@/lib/generate";
import { insertDrafts, listBriefing } from "@/lib/briefings";
import { runPreOpenDigest } from "@/lib/digest";

export const dynamic = "force-dynamic";
export const maxDuration = 60; // LLM 生成可能要几十秒

// Asia/Shanghai 星期(0=周日 .. 6=周六)
function beijingWeekday(): number {
  const s = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Shanghai",
    weekday: "short",
  }).format(new Date());
  const map: Record<string, number> = {
    Sun: 0,
    Mon: 1,
    Tue: 2,
    Wed: 3,
    Thu: 4,
    Fri: 5,
    Sat: 6,
  };
  return map[s] ?? -1;
}

export async function GET(req: NextRequest) {
  // 鉴权:Vercel cron 会带 Authorization: Bearer ${CRON_SECRET}
  const secret = process.env.CRON_SECRET;
  if (secret) {
    if (req.headers.get("authorization") !== `Bearer ${secret}`) {
      return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
    }
  }

  // 跳过周末(A股不开盘;节假日日历放二期)
  const wd = beijingWeekday();
  if (wd === 0 || wd === 6) {
    return NextResponse.json({ ok: true, skipped: "weekend" });
  }

  // 幂等:当天已生成过就不重复
  const date = todayISO();
  const existing = await listBriefing({ date });
  if (existing.length > 0) {
    return NextResponse.json({
      ok: true,
      skipped: "already-exists",
      date,
      count: existing.length,
    });
  }

  try {
    const { drafts, engine, usMarketClosed } = await generateDrafts();
    // 美股休市(节假日):不硬拿旧数据生成隔夜映射,明说跳过
    if (usMarketClosed) {
      return NextResponse.json({ ok: true, date, skipped: "us-market-closed" });
    }
    // 方案 B:生成后直接发布上线
    const created = await insertDrafts(
      drafts.map((d) => ({ ...d, status: "published" as const }))
    );
    // 盘前推送:发布后,给有自选+有相关动态的用户推一条(同一 cron 内做,省一个 cron 额度)
    const digest = await runPreOpenDigest().catch(() => null);
    return NextResponse.json({
      ok: true,
      date,
      engine,
      published: created.length,
      digest,
    });
  } catch (e) {
    return NextResponse.json({ ok: false, error: String(e) }, { status: 500 });
  }
}
