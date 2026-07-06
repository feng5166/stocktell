import { NextRequest, NextResponse } from "next/server";
import { generateDrafts } from "@/lib/generate";
import { insertDrafts } from "@/lib/briefings";
import { generateChainTake } from "@/lib/chain-take";
import { isAdminAuthorized } from "@/lib/api-guard";
import { isAdminSession } from "@/lib/admin";
import { getPrisma } from "@/lib/prisma";
import { setBriefStatus } from "@/lib/brief-status";

export const dynamic = "force-dynamic";
// replace 全链路 = 生成(LLM)+重写缓存+链级判断(LLM),60s 会重演"跑一半被硬杀"(07-03 事故同款)
export const maxDuration = 300;

export async function POST(req: NextRequest) {
  const date = req.nextUrl.searchParams.get("date") || undefined; // YYYY-MM-DD,指定日期生成
  const dryRun = req.nextUrl.searchParams.get("dryRun") === "1"; // 预览:只返回不落库
  const useLLM = req.nextUrl.searchParams.get("llm") === "1"; // 预览默认用模板(快);要 LLM 文案加 llm=1
  const replace = req.nextUrl.searchParams.get("replace") === "1"; // 重刷:删该日旧简报→新口径重生成并发布

  // 生成一律属管理操作(烧 LLM、写库)。此前不带参数的 POST 不鉴权,任何人可刷 draft
  // (2026-07-03 早上 07:54 出现过一批来路不明的 draft),现收紧:所有 POST 都要管理员。
  if (!isAdminAuthorized(req) && !(await isAdminSession())) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  try {
    // 预览默认走模板引擎(避免 LLM 慢撞 Hobby 60s 上限);正式生成仍用 LLM
    const { date: d, drafts, engine, usMarketClosed } = await generateDrafts({
      date,
      forceTemplate: dryRun && !useLLM,
    });
    if (dryRun) {
      return NextResponse.json({
        ok: true,
        date: d,
        engine,
        usMarketClosed,
        dryRun: true,
        count: drafts.length,
        items: drafts,
      });
    }

    // 重刷:先删该日旧简报(注意:今日简报尚无 outcome 记账,删除安全),再以发布态写入
    if (replace) {
      const db = getPrisma();
      if (db) await db.briefingItem.deleteMany({ where: { date: d } });
      const created = await insertDrafts(
        drafts.map((x) => ({ ...x, status: "published" as const }))
      );
      // 该日派生缓存全部基于被删掉的旧条目生成,必须一并作废,否则重刷等于白刷:
      // 早报(v5:{date}:)、早报深读(morningv2:{date}:)继续给用户讲旧叙事讲到午夜。
      // 链级判断(chaintake:{date}:)删后立刻按新条目重生成,链页无空窗。
      // purged 如实上报:删失败要让管理员知道(否则以为重刷完成,旧缓存其实还在服务)。
      let purged = true;
      const purgeDerived = async (withChainTake: boolean) => {
        if (!db) return;
        const keys = [
          { key: { startsWith: `v5:${d}:` } },
          { key: { startsWith: `v4:${d}:` } }, // 上一版 key 的残留行一并清
          // 只清会随后重生成的 ai 链:若清全部链却只重生成 ai,其他链的判断会被误删不补
          ...(withChainTake ? [{ key: { startsWith: `chaintake:${d}:ai:` } }] : []),
        ];
        await db.morningBriefCache
          .deleteMany({ where: { OR: keys } })
          .catch(() => {
            purged = false;
          });
        await db.deepAnalysisCache
          .deleteMany({
            where: {
              OR: [
                { briefingId: { startsWith: `morningv2:${d}:` } },
                { briefingId: { startsWith: `morning:${d}:` } },
              ],
            },
          })
          .catch(() => {
            purged = false;
          });
      };
      await purgeDerived(true);
      const chainTake = await generateChainTake("ai", d, created, { force: true })
        .then((r) => !!r.take)
        .catch(() => false);
      // 二次清扫(不含刚重生成的 chaintake):replace 进行中,可能有请求已读到旧条目、
      // 正在 LLM 里(10~22s),会在第一次清扫后把旧叙事写回;到这里已过链级判断的几十秒,
      // 再扫一遍把竞态写回的旧行清掉。
      await purgeDerived(false);
      // 状态标识(规则4:replace 不能伪造市场状态)。休市→market_closed(即使强制补发也 count=0,
      // 不伪造简报);有内容→manual_reissue(人工补发);交易日 0 条→failed。
      await setBriefStatus(
        d,
        usMarketClosed
          ? { status: "market_closed", reason: "us_market_closed", message: "美股休市,今日无新的隔夜美股映射。" }
          : created.length > 0
            ? { status: "manual_reissue" }
            : { status: "failed", reason: "data_fetch_failed", message: `交易日 ${d} 补发 0 条(movers 为空/美股行情陈旧)。` }
      );
      return NextResponse.json({
        ok: true,
        date: d,
        engine,
        usMarketClosed,
        replaced: true,
        count: created.length,
        purgedDerived: purged,
        chainTake,
      });
    }

    const created = await insertDrafts(drafts);
    return NextResponse.json({
      ok: true,
      date: d,
      engine,
      usMarketClosed,
      count: created.length,
      items: created,
    });
  } catch (e) {
    return NextResponse.json({ ok: false, error: String(e) }, { status: 500 });
  }
}
