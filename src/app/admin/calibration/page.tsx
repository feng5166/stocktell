import { requireAdmin } from "@/lib/admin";
import { getPrisma } from "@/lib/prisma";
import { readOutcomeAgg, MIN_SAMPLE } from "@/lib/outcome-agg";

export const dynamic = "force-dynamic";

// 置信度/关系分级校准复盘(2.3 P2-2,内部页):
// 回答「我们的分级体系有没有区分度」——直接映射档的历史同向是否高于情绪映射档;
// 哪些环节的同向表现与关系档假设背离(该升/降档的候选)。
// 数据 = M3 聚合快照(纯读,零现算)。先只进 admin:对外页面是否开放由负责人另行拍板
// (对外必须走「历史统计·非预测」口径且防止被读成胜率)。
export default async function CalibrationPage() {
  await requireAdmin();
  const db = getPrisma();
  const agg = await readOutcomeAgg().catch(() => null);

  // 按关系档汇总(校准主问题:档位区分度)
  const byRel = new Map<string, { n: number; hits: number }>();
  for (const r of agg?.bySegment ?? []) {
    const m = byRel.get(r.relation) ?? { n: 0, hits: 0 };
    m.n += r.n;
    m.hits += r.hits;
    byRel.set(r.relation, m);
  }
  const REL_ORDER = ["直接映射", "间接映射", "情绪映射", "弱映射"];
  const relRows = REL_ORDER.filter((r) => byRel.has(r)).map((r) => ({ rel: r, ...byRel.get(r)! }));

  // 环节明细(背离候选:同一关系档内同向表现差异大的环节)
  const segRows = (agg?.bySegment ?? []).slice().sort((a, b) => b.n - a.n);

  // 已发布 doc 的置信度分布(生成侧封顶「中」,高=人审给;此处看分布是否健康)
  const confDist = new Map<string, number>();
  if (db) {
    const docs = await db.insightDoc
      .findMany({
        where: { status: "published" },
        select: { payload: true },
        orderBy: { date: "desc" },
        take: 200,
      })
      .catch(() => [] as Array<{ payload: unknown }>);
    for (const d of docs) {
      const c = (d.payload as { confidence?: string }).confidence ?? "?";
      confDist.set(c, (confDist.get(c) ?? 0) + 1);
    }
  }

  return (
    <div className="mx-auto max-w-4xl px-4 py-6 sm:px-6">
      <h1 className="text-h1 font-semibold tracking-tight">分级校准复盘(内部)</h1>
      <p className="mt-1 text-xs leading-relaxed text-gray-400">
        用 M3 历史同向聚合验证关系分级的区分度。口径:历史统计·非预测;
        计数为「已判定次数 / 次日同向次数」,不换算胜率。快照更新于{" "}
        {agg?.updatedAt ? agg.updatedAt.slice(0, 16).replace("T", " ") : "—(尚无快照,等 outcome cron 首跑)"}。
      </p>

      <section className="mt-5 rounded-xl bg-white p-4 shadow-sm">
        <h2 className="text-sm font-semibold text-gray-700">按关系档(区分度主检)</h2>
        <p className="mt-0.5 text-xs text-gray-400">
          预期:直接映射的同向占比 &gt; 间接 &gt; 情绪。若倒挂 = 分级标准需要复审(relation-review 队列)。
        </p>
        {relRows.length === 0 ? (
          <p className="mt-3 text-sm text-gray-400">暂无样本。</p>
        ) : (
          <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
            {relRows.map((r) => (
              <div key={r.rel} className="rounded-lg bg-gray-50 px-3 py-2">
                <div className="text-meta text-gray-400">{r.rel}</div>
                <div className="mt-0.5 text-lg font-semibold tabular-nums text-gray-800">
                  {r.hits}/{r.n}
                </div>
                <div className="text-[11px] text-gray-400">
                  {r.n < MIN_SAMPLE ? "样本积累中" : "次日同向/已判定"}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="mt-5 rounded-xl bg-white p-4 shadow-sm">
        <h2 className="text-sm font-semibold text-gray-700">按环节(升/降档候选观察)</h2>
        <div className="mt-2 overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200 text-left text-xs text-gray-500">
                <th className="px-2 py-1.5 font-medium">链</th>
                <th className="px-2 py-1.5 font-medium">环节</th>
                <th className="px-2 py-1.5 font-medium">关系档</th>
                <th className="px-2 py-1.5 text-right font-medium">同向/判定</th>
              </tr>
            </thead>
            <tbody>
              {segRows.map((r) => (
                <tr key={`${r.chainId}|${r.segment}|${r.relation}`} className="border-b border-gray-100 last:border-0">
                  <td className="px-2 py-1.5 text-xs text-gray-500">{r.chainId}</td>
                  <td className="px-2 py-1.5 text-gray-800">{r.segment}</td>
                  <td className="px-2 py-1.5 text-xs text-gray-500">{r.relation}</td>
                  <td className="px-2 py-1.5 text-right tabular-nums text-gray-800">
                    {r.hits}/{r.n}
                    {r.n < MIN_SAMPLE && <span className="ml-1 text-[11px] text-gray-400">(样本不足)</span>}
                  </td>
                </tr>
              ))}
              {segRows.length === 0 && (
                <tr>
                  <td colSpan={4} className="px-2 py-6 text-center text-sm text-gray-400">
                    暂无样本
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section className="mt-5 rounded-xl bg-white p-4 shadow-sm">
        <h2 className="text-sm font-semibold text-gray-700">已发布 doc 置信度分布(近 200 篇)</h2>
        <p className="mt-0.5 text-xs text-gray-400">
          生成侧封顶「中」;「高」只能人审给。若「高」占比异常高 = 人审给分习惯需要复查。
        </p>
        <div className="mt-3 flex gap-3">
          {["高", "中", "低"].map((c) => (
            <div key={c} className="rounded-lg bg-gray-50 px-4 py-2">
              <span className="text-xs text-gray-400">置信 {c}</span>{" "}
              <b className="tabular-nums text-gray-800">{confDist.get(c) ?? 0}</b>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
