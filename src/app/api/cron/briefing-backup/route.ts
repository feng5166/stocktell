import { NextRequest, NextResponse } from "next/server";
import { isCronAuthorized } from "@/lib/api-guard";
import { alertCron } from "@/lib/monitor";

export const dynamic = "force-dynamic";
export const maxDuration = 300; // 要等主流程(生成+推送)跑完,主流程上限已放宽到 300s

// 补位:主简报 cron(07:00 北京)若漏触发 / 当时隔夜行情抓空,40 分钟后(07:40)再戳一次主流程。
// 主流程幂等(已发布→跳过;发布了但没推→补推),所以主 cron 成功时这里近似 no-op。
// 同时补跑 insight 每日推理(主跑 07:05,若失败这里 07:40 兜底)——独立且幂等,无论主简报补位
// 结果如何都触发一次(evidence:insight 不依赖本次简报补位的成功与否,08:30 看门狗再兜一层)。
async function backupInsightDaily(base: string, secret: string) {
  return fetch(`${base}/api/cron/insight-daily`, {
    headers: { Authorization: `Bearer ${secret}` },
    cache: "no-store",
  })
    .then((x) => x.json())
    .catch(() => null);
}

export async function GET(req: NextRequest) {
  if (!isCronAuthorized(req)) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }
  const base = process.env.NEXTAUTH_URL || "https://www.stocktell.me";
  const secret = process.env.CRON_SECRET || "";
  // 本函数 maxDuration=300 与下游主流程最坏耗时相同,裸等会先被平台硬杀。留余量 280s 主动 abort,
  // 但 abort ≠ 失败:补位真正管用的那天(07:00 漏了)下游要跑满生成+推送 ~300s,280s abort 属正常,
  // 不能误报"补位失败"(评审 finding 8)。abort 交给 08:30 看门狗核对真相,这里只对"明确失败"告警:
  // 下游返回非 2xx(r.ok=false)、或非 abort 的网络异常。
  const ctrl = new AbortController();
  let aborted = false;
  const t = setTimeout(() => {
    aborted = true;
    ctrl.abort();
  }, 280_000);
  try {
    const r = await fetch(`${base}/api/cron/briefing`, {
      headers: { Authorization: `Bearer ${secret}` },
      cache: "no-store",
      signal: ctrl.signal,
    });
    const primary = await r.json().catch(() => ({}));
    // abort 可能发生在 body 读阶段(头已到、体慢)——此时 r.json() 被 .catch 吞成 {},
    // 若不判 aborted 会把"下游还在跑"误报成成功/失败。aborted 一律走中性 inconclusive。
    if (aborted) {
      // B2-7:主简报 abort=已耗尽 280s 预算,这里【绝不能】再 await 无超时的 insight fetch
      // (它自身 maxDuration 300s,会吃穿 backup 的 300s 被硬杀、丢掉 inconclusive 返回)。
      // insight 补跑由「成功/失败路径已触发」+「08:30 看门狗按链点名」双覆盖,此处跳过不漏。
      return NextResponse.json({
        ok: true,
        backup: true,
        inconclusive: "primary-still-running",
        insight: "skipped-budget",
      });
    }
    // 不检查 r.ok 会把主流程 401/500/非 JSON 一律吞成"补位成功",掩盖真实失败。
    if (!r.ok) {
      await alertCron(
        "briefing-backup(补位)",
        `补位回调主 cron 返回 HTTP ${r.status},主流程可能失败:${JSON.stringify(primary).slice(0, 200)}`
      );
      // 主简报失败也补一次 insight(独立;insight 读的是"已发布简报",没有就自然 skip)
      const insight = await backupInsightDaily(base, secret);
      return NextResponse.json(
        { ok: false, backup: true, status: r.status, primary, insight },
        { status: 502 }
      );
    }
    const insight = await backupInsightDaily(base, secret);
    return NextResponse.json({ ok: true, backup: true, primary, insight });
  } catch (e) {
    if (aborted) {
      // 下游 280s 未返回(abort 时在飞的 fetch 以 AbortError reject → 走这里,是 abort 的主路径):
      // 多半在正常跑满生成+推送,不告警(看门狗兜底),返回中性状态。
      // B2-7:同 line 46,abort=280s 预算已耗尽,【绝不能】再 await 无超时的 insight fetch
      // (insight-daily 自身 maxDuration 300s,会吃穿 backup 剩余预算被硬杀、丢掉 inconclusive 返回)。
      // insight 补跑由「成功/失败路径已触发」+「08:30 看门狗按链点名」双覆盖,此处跳过不漏。
      return NextResponse.json({
        ok: true,
        backup: true,
        inconclusive: "primary-still-running",
        insight: "skipped-budget",
      });
    }
    // 非 abort 的 fetch 异常(网络错等)才告警——与全站「cron 失败必飞书」一致
    await alertCron("briefing-backup(补位)", e);
    return NextResponse.json({ ok: false, error: String(e) }, { status: 500 });
  } finally {
    clearTimeout(t);
  }
}
