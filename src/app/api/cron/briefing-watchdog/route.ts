import { NextRequest, NextResponse } from "next/server";
import { listBriefing } from "@/lib/briefings";
import { todayISO } from "@/lib/date";
import { isAshareTradingDay } from "@/lib/tushare";
import { isCronAuthorized } from "@/lib/api-guard";
import { alertCron } from "@/lib/monitor";
import { sendFeishu } from "@/lib/feishu";
import { getPrisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

// 简报状态日报 / 看门狗:08:30 北京(主 07:00 + 补位 07:40 都尘埃落定后),
// 每个交易日核对当天简报,成功 ✅ / 失败 ❌ 都推飞书,把"静默漏一整天"变成"每早可感知"。
export async function GET(req: NextRequest) {
  if (!isCronAuthorized(req)) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }
  const date = todayISO();
  if (!(await isAshareTradingDay(date))) {
    return NextResponse.json({ ok: true, skipped: "non-trading-day", date });
  }
  const items = await listBriefing({ date, status: "published" }).catch(() => []);
  if (items.length > 0) {
    // 简报在 ≠ 邮件发了:生成和推送在同一函数里串行,推送段被超时截断时简报照常在库
    // (2026-07-03 事故)。用当天早报缓存(digest 发送时逐用户写 morning_brief_cache)当
    // "邮件流程跑过"的证据:简报在而缓存 0 条 → 推送段大概率没跑,降级为 ❌ 告警。
    const db = getPrisma();
    const briefCaches = db
      ? await db.morningBriefCache
          .count({ where: { key: { startsWith: `v3:${date}:` } } })
          .catch(() => -1)
      : -1;
    if (briefCaches === 0) {
      const fs = await sendFeishu(
        `❌ StockTell 简报在但邮件疑似没发 · ${date} · 简报 ${items.length} 条,早报缓存 0 条(推送段可能被截断)。请补推:POST /api/admin/push-digest(Bearer ADMIN_TOKEN)`
      );
      await alertCron("简报看门狗", `交易日 ${date} 简报已发布但早报缓存为 0,盘前邮件疑似未发,需手动补推`);
      return NextResponse.json({ ok: true, date, count: items.length, digestSuspect: true, feishu: fs });
    }
    // 成功:推一条确认(主/补位 cron 正常跑通)
    const fs = await sendFeishu(
      `✅ StockTell 今日简报已就绪 · ${date} · 共 ${items.length} 条,早报缓存 ${briefCaches < 0 ? "?" : briefCaches} 份(主/补位 cron 正常)`
    );
    return NextResponse.json({ ok: true, date, count: items.length, briefCaches, feishu: fs });
  }
  // 失败:主 + 补位都没产出 → 告警让人工补
  const fs = await sendFeishu(
    `❌ StockTell 今日简报缺失 · ${date} · 到 08:30 仍 0 条(主 07:00 + 补位 07:40 都没出)。请手动补:POST /api/briefing/generate?replace=1&llm=1(Bearer ADMIN_TOKEN)`
  );
  await alertCron("简报看门狗", `交易日 ${date} 到 08:30 仍无已发布简报,需手动补`);
  return NextResponse.json({ ok: true, date, alerted: true, count: 0, feishu: fs });
}
