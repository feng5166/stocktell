import { requireAdmin } from "@/lib/admin";
import { getPrisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

// Pro 意向月度复盘(2.3 P2-3):每月固定看一次「信号→决策」。
// 内容:pro_intent_v2 按月分组(能力票选/使用场景计数)+ 点击者画像
// (自选规模分布、近 30 天是否活跃)。页面级行为(verify_point_follow、
// share 漏斗、stocks_filter_use 链分布)在 Umami 交叉看,这里只做 DB 侧事实。
// 复盘动作(人工):每月据此升/降候选能力清单(docs/monetization-tiers-draft.md)。
type IntentRow = { userId: string | null; content: string; createdAt: Date };

export default async function ProReviewPage() {
  await requireAdmin();
  const db = getPrisma();
  const rows: IntentRow[] = db
    ? await db.feedback
        .findMany({
          where: { category: "pro_intent_v2" },
          select: { userId: true, content: true, createdAt: true },
          orderBy: { createdAt: "desc" },
          take: 2000,
        })
        .catch(() => [] as IntentRow[])
    : [];

  // 按月分组(登录用户当月去重取最新;匿名按次)
  const months = new Map<
    string,
    { total: number; choices: Map<string, number>; cases: Map<string, number>; users: Set<string> }
  >();
  const seenUserMonth = new Set<string>();
  for (const r of rows) {
    const ym = r.createdAt.toISOString().slice(0, 7);
    const m =
      months.get(ym) ??
      { total: 0, choices: new Map<string, number>(), cases: new Map<string, number>(), users: new Set<string>() };
    months.set(ym, m);
    if (r.userId) {
      const k = `${ym}:${r.userId}`;
      if (seenUserMonth.has(k)) continue;
      seenUserMonth.add(k);
      m.users.add(r.userId);
    }
    try {
      const o = JSON.parse(r.content) as { choices?: string[]; useCase?: string };
      m.total++;
      for (const c of o.choices ?? []) m.choices.set(c, (m.choices.get(c) ?? 0) + 1);
      if (o.useCase) m.cases.set(o.useCase, (m.cases.get(o.useCase) ?? 0) + 1);
    } catch {
      /* 非结构化残留跳过 */
    }
  }

  // 点击者画像:自选规模 + 近 30 天活跃(lastLoginAt)
  const allUsers = Array.from(new Set(rows.map((r) => r.userId).filter((x): x is string => !!x)));
  let profile: { small: number; mid: number; large: number; active30: number } | null = null;
  if (db && allUsers.length) {
    const [watchCounts, users] = await Promise.all([
      db.watchlist.groupBy({ by: ["userId"], where: { userId: { in: allUsers } }, _count: { _all: true } }).catch(() => []),
      db.user
        .findMany({ where: { id: { in: allUsers } }, select: { id: true, lastLoginAt: true } })
        .catch(() => [] as Array<{ id: string; lastLoginAt: Date | null }>),
    ]);
    const wc = new Map(
      (watchCounts as Array<{ userId: string; _count: { _all: number } }>).map((w) => [w.userId, w._count._all])
    );
    const since30 = Date.now() - 30 * 86400000;
    profile = { small: 0, mid: 0, large: 0, active30: 0 };
    for (const u of users) {
      const n = wc.get(u.id) ?? 0;
      if (n <= 2) profile.small++;
      else if (n <= 8) profile.mid++;
      else profile.large++;
      if (u.lastLoginAt && u.lastLoginAt.getTime() >= since30) profile.active30++;
    }
  }

  const fmt = (m: Map<string, number>) =>
    Array.from(m.entries())
      .sort((a, b) => b[1] - a[1])
      .map(([k, n]) => `${k}×${n}`)
      .join(" / ") || "—";

  return (
    <div className="mx-auto max-w-4xl px-4 py-6 sm:px-6">
      <h1 className="text-h1 font-semibold tracking-tight">Pro 意向月度复盘</h1>
      <p className="mt-1 text-xs leading-relaxed text-gray-400">
        每月对照 docs/monetization-tiers-draft.md 复盘一次:哪条候选能力升/降。
        枚举含义见 src/lib/pro-intent.ts;页面级行为(verify_point_follow / share 漏斗 /
        stocks_filter_use)在 Umami 交叉。
        <b className="text-gray-500">
          提醒:若付费在 6 个月规划内,「收费+个股解读」的法律意见(PRODUCT-CORE §7)现在就该另立项启动。
        </b>
      </p>

      {profile && (
        <section className="mt-5 rounded-xl bg-white p-4 shadow-sm">
          <h2 className="text-sm font-semibold text-gray-700">意向用户画像(登录提交者 {allUsers.length} 人)</h2>
          <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
            {[
              ["自选 ≤2 只", profile.small],
              ["自选 3-8 只", profile.mid],
              ["自选 >8 只", profile.large],
              ["近 30 天活跃", profile.active30],
            ].map(([label, val]) => (
              <div key={String(label)} className="rounded-lg bg-gray-50 px-3 py-2">
                <div className="text-meta text-gray-400">{label}</div>
                <div className="mt-0.5 text-lg font-semibold tabular-nums text-gray-800">{String(val)}</div>
              </div>
            ))}
          </div>
        </section>
      )}

      {Array.from(months.entries())
        .sort((a, b) => b[0].localeCompare(a[0]))
        .map(([ym, m]) => (
          <section key={ym} className="mt-5 rounded-xl bg-white p-4 shadow-sm">
            <h2 className="text-sm font-semibold text-gray-700">
              {ym} <span className="ml-2 text-xs font-normal text-gray-400">{m.total} 份(登录当月去重)</span>
            </h2>
            <div className="mt-2 space-y-1 text-xs leading-relaxed text-gray-600">
              <p>
                <b className="text-gray-700">能力票选:</b>
                {fmt(m.choices)}
              </p>
              <p>
                <b className="text-gray-700">使用场景:</b>
                {fmt(m.cases)}
              </p>
            </div>
          </section>
        ))}
      {months.size === 0 && (
        <div className="mt-6 rounded-xl border border-dashed border-gray-300 bg-white py-10 text-center text-sm text-gray-400">
          暂无 pro_intent_v2 意向数据。
        </div>
      )}
    </div>
  );
}
