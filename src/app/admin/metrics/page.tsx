import { requireAdmin } from "@/lib/admin";
import { getPrisma } from "@/lib/prisma";
import { todayISO } from "@/lib/date";

export const dynamic = "force-dynamic";

interface Row {
  route: string;
  ymd: string;
  count: number;
  sumMs: number;
  maxMs: number;
  errors: number;
  slow: number;
}

// 近 N 天的 Asia/Shanghai YYYYMMDD 列表(今天在前)
function recentYmds(n: number): string[] {
  const fmt = (d: Date) =>
    new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Shanghai",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    })
      .format(d)
      .replace(/-/g, "");
  const out: string[] = [];
  const now = Date.now();
  for (let i = 0; i < n; i++) out.push(fmt(new Date(now - i * 86400000)));
  return out;
}

// 意向计数去重(缓修:行数会被同一用户反复点虚增)——登录用户按 userId 去重,匿名按次
// (无身份可去,如实计;限流已挡机刷)。表小(意向类顶多几百行),findMany 内存去重足够。
async function intentCount(db: NonNullable<ReturnType<typeof getPrisma>>, category: string): Promise<number> {
  try {
    const rows = await db.feedback.findMany({ where: { category }, select: { userId: true } });
    const users = new Set(rows.map((r) => r.userId).filter(Boolean));
    return users.size + rows.filter((r) => !r.userId).length;
  } catch {
    return -1;
  }
}

export default async function AdminMetricsPage() {
  await requireAdmin();
  const db = getPrisma();
  const days = recentYmds(7);
  const today = days[0];

  let rows: Row[] = [];
  if (db) {
    rows = (await db.apiMetric
      .findMany({ where: { ymd: { in: days } } })
      .catch(() => [])) as Row[];
  }

  const todayRows = rows
    .filter((r) => r.ymd === today)
    .sort((a, b) => b.count - a.count);

  // 近 7 天按路由合计
  const agg = new Map<string, Row>();
  for (const r of rows) {
    const a = agg.get(r.route) ?? {
      route: r.route,
      ymd: "7d",
      count: 0,
      sumMs: 0,
      maxMs: 0,
      errors: 0,
      slow: 0,
    };
    a.count += r.count;
    a.sumMs += r.sumMs;
    a.maxMs = Math.max(a.maxMs, r.maxMs);
    a.errors += r.errors;
    a.slow += r.slow;
    agg.set(r.route, a);
  }
  const weekRows = Array.from(agg.values()).sort((a, b) => b.count - a.count);

  const totalToday = todayRows.reduce((s, r) => s + r.count, 0);
  const errToday = todayRows.reduce((s, r) => s + r.errors, 0);
  const slowToday = todayRows.reduce((s, r) => s + r.slow, 0);

  // 商业化 / 增长信号(2.2-C 运营看板):DB 侧可得的转化与留存代理指标。
  // 页面级流量(日活/首页点击/insight 停留/SEO 来路)看 Umami 后台;这里补 Umami 看不到的 DB 事实。
  const since7d = new Date(Date.now() - 7 * 86400000);
  // W9(五轮 review):日期直接用写入方同源的 todayISO(),不做"去横线再正则加回"的双重转换
  // (正则不匹配时 replace 原样返回、过滤零行且 catch 不触发=静默归零);清理①:八读并行。
  const biz = db
    ? await (async () => {
        const [users, usersNew7d, watchRows, watchNew7d, digestToday, proIntent, subIntent, reviewPending] =
          await Promise.all([
            db.user.count().catch(() => -1),
            db.user.count({ where: { createdAt: { gte: since7d } } }).catch(() => -1),
            db.watchlist.count().catch(() => -1),
            db.watchlist.count({ where: { createdAt: { gte: since7d } } }).catch(() => -1),
            db.digestSendLog.count({ where: { date: todayISO() } }).catch(() => -1),
            intentCount(db, "专业版意向"),
            intentCount(db, "订阅意向"),
            db.relationReview.count({ where: { status: "pending" } }).catch(() => -1),
          ]);
        return { users, usersNew7d, watchRows, watchNew7d, digestToday, proIntent, subIntent, reviewPending };
      })()
    : null;

  return (
    <div className="mx-auto max-w-4xl px-4 py-6 sm:px-6">
      <h1 className="text-h1 font-semibold tracking-tight">接口监控</h1>
      <p className="mt-1 text-xs text-gray-400">
        按路由聚合的调用次数 / 响应时间(Asia/Shanghai 日维度)。慢响应(≥
        阈值)与错误会触发飞书告警。
      </p>

      {biz && (
        <section className="mt-5 rounded-xl bg-white p-4 shadow-sm">
          <h2 className="text-sm font-semibold text-gray-700">商业化 / 增长信号(2.2-C)</h2>
          <p className="mt-0.5 text-xs text-gray-400">
            页面级漏斗(日活/首页点击/insight 停留/SEO 来路/stocks_filter_use 等事件)看 Umami 后台;
            此处为 DB 侧事实。事件口径:docs/埋点需求.md。
          </p>
          <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
            {[
              ["注册用户", `${biz.users}(7日+${biz.usersNew7d})`],
              ["自选条目", `${biz.watchRows}(7日+${biz.watchNew7d})`],
              ["今日早报送达", String(biz.digestToday)],
              ["专业版意向(登录去重+匿名按次)", String(biz.proIntent)],
              ["订阅意向(登录去重+匿名按次)", String(biz.subIntent)],
              ["待审关系队列", String(biz.reviewPending)],
            ].map(([label, val]) => (
              <div key={label} className="rounded-lg bg-gray-50 px-3 py-2">
                <div className="text-meta text-gray-400">{label}</div>
                <div className="mt-0.5 text-lg font-semibold tabular-nums text-gray-800">{val}</div>
              </div>
            ))}
          </div>
        </section>
      )}

      {!db ? (
        <div className="mt-6 rounded-xl border border-dashed border-gray-300 bg-white py-10 text-center text-sm text-gray-500">
          未连接数据库,监控不可用。
        </div>
      ) : (
        <>
          {/* 今日概览 */}
          <div className="mt-4 grid grid-cols-3 gap-3">
            <Stat label={`今日调用(${today.slice(4, 6)}-${today.slice(6, 8)})`} value={totalToday.toLocaleString()} />
            <Stat label="今日慢响应" value={String(slowToday)} tone={slowToday > 0 ? "amber" : undefined} />
            <Stat label="今日错误" value={String(errToday)} tone={errToday > 0 ? "rose" : undefined} />
          </div>

          <Section title="今日 · 按路由">
            <MetricTable rows={todayRows} empty="今天还没有埋点数据" />
          </Section>

          <Section title="近 7 天合计 · 按路由">
            <MetricTable rows={weekRows} empty="近 7 天暂无数据" />
          </Section>
        </>
      )}
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: string; tone?: "amber" | "rose" }) {
  const c = tone === "amber" ? "text-amber-700" : tone === "rose" ? "text-rose-600" : "text-gray-900";
  return (
    <div className="rounded-xl bg-white p-3 shadow-sm">
      <div className="text-xs text-gray-400">{label}</div>
      <div className={`mt-0.5 text-2xl font-semibold tabular-nums ${c}`}>{value}</div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mt-6">
      <h2 className="mb-2 text-sm font-semibold text-gray-700">{title}</h2>
      {children}
    </section>
  );
}

function MetricTable({ rows, empty }: { rows: Row[]; empty: string }) {
  if (rows.length === 0)
    return (
      <div className="rounded-xl border border-dashed border-gray-300 bg-white py-8 text-center text-sm text-gray-400">
        {empty}
      </div>
    );
  return (
    <div className="overflow-hidden rounded-xl bg-white shadow-sm">
      <div className="overflow-x-auto">
        <table className="min-w-full text-sm">
          <thead>
            <tr className="border-b border-gray-200 bg-gray-50 text-left text-xs text-gray-500">
              <th className="px-3 py-2 font-medium">路由</th>
              <th className="px-3 py-2 text-right font-medium">调用</th>
              <th className="px-3 py-2 text-right font-medium">平均</th>
              <th className="px-3 py-2 text-right font-medium">峰值</th>
              <th className="px-3 py-2 text-right font-medium">慢</th>
              <th className="px-3 py-2 text-right font-medium">错误</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const avg = r.count ? Math.round(r.sumMs / r.count) : 0;
              return (
                <tr key={r.route} className="border-b border-gray-100 last:border-0">
                  <td className="px-3 py-2 font-mono text-xs text-gray-700">/{r.route}</td>
                  <td className="px-3 py-2 text-right tabular-nums text-gray-800">
                    {r.count.toLocaleString()}
                  </td>
                  <td className={`px-3 py-2 text-right tabular-nums ${avg >= 8000 ? "text-amber-700" : "text-gray-600"}`}>
                    {avg}ms
                  </td>
                  <td className={`px-3 py-2 text-right tabular-nums ${r.maxMs >= 8000 ? "text-amber-700" : "text-gray-500"}`}>
                    {(r.maxMs / 1000).toFixed(1)}s
                  </td>
                  <td className={`px-3 py-2 text-right tabular-nums ${r.slow > 0 ? "font-medium text-amber-700" : "text-gray-300"}`}>
                    {r.slow || "—"}
                  </td>
                  <td className={`px-3 py-2 text-right tabular-nums ${r.errors > 0 ? "font-medium text-rose-600" : "text-gray-300"}`}>
                    {r.errors || "—"}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
