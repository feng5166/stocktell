import { requireAdmin } from "@/lib/admin";
import { runDiagnostics } from "@/lib/resolver-diagnostics";

export const dynamic = "force-dynamic";

// P1 resolver 健康面板(观察期 #1)。读实时 staticRelations,静态查底座健康。仅 admin。
// 运行时项(fallback/cache miss/生产日志)= 需生产监控,不在此面板。
const TYPE_LABEL: Record<string, string> = {
  direct: "直接", indirect: "间接", sentiment: "情绪", weak: "弱", trigger: "触发源", candidate: "待验证",
};

export default async function ResolverHealthPage() {
  await requireAdmin();
  const d = runDiagnostics();
  const m = d.metrics;

  const metricCards: { label: string; value: number | string; warn: boolean }[] = [
    { label: "unknown relationType", value: m.unknownRelationType, warn: m.unknownRelationType > 0 },
    { label: "unknown segment", value: m.unknownSegment, warn: m.unknownSegment > 0 },
    { label: "empty relation", value: m.emptyRelation, warn: m.emptyRelation > 0 },
    { label: "duplicate relation", value: m.duplicate, warn: m.duplicate > 0 },
    { label: "daily 覆盖 static 未改档", value: m.dailyCoverStaticNoChange, warn: m.dailyCoverStaticNoChange > 0 },
    { label: "reviewQueue 新增", value: m.reviewQueueNew, warn: false },
    { label: "resolver 非 static 输出", value: m.nonStaticResolve, warn: m.nonStaticResolve > 0 },
    { label: "fallback 命中(运行时)", value: m.fallbackHits ?? "需生产监控", warn: false },
  ];

  return (
    <div className="mx-auto max-w-4xl px-4 py-8 sm:px-6">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h1 className="text-h1 font-semibold tracking-tight text-gray-900">resolver 健康面板</h1>
        <span className={`rounded-lg px-3 py-1 text-sm font-semibold ${d.passed ? "bg-emerald-100 text-emerald-700" : "bg-rose-100 text-rose-700"}`}>
          {d.passed ? "✅ 底座静态健康" : "✗ 有异常需处理"}
        </span>
      </div>
      <p className="mt-1 text-sm text-gray-500">
        观察期只读诊断 · 读实时 staticRelations。关系 <b className="text-gray-700">{d.total}</b> 条 · 链 {d.chains} 条 ·{" "}
        {Object.entries(d.byType).map(([t, n]) => `${TYPE_LABEL[t] ?? t} ${n}`).join(" / ")}
      </p>

      {/* 指标卡 */}
      <div className="mt-5 grid grid-cols-2 gap-2.5 sm:grid-cols-4">
        {metricCards.map((c) => (
          <div key={c.label} className={`rounded-xl bg-white p-3 shadow-sm ${c.warn ? "ring-1 ring-rose-300" : ""}`}>
            <div className={`text-2xl font-semibold tabular-nums ${c.warn ? "text-rose-600" : "text-gray-900"}`}>{c.value}</div>
            <div className="mt-0.5 text-xs text-gray-500">{c.label}</div>
          </div>
        ))}
      </div>

      {/* 检查项 */}
      <h2 className="mt-8 text-h2 font-semibold text-gray-900">健康检查</h2>
      <div className="mt-3 space-y-1.5">
        {d.checks.map((c) => (
          <div key={c.name} className={`flex items-center gap-2 rounded-lg bg-white px-3 py-2 text-sm shadow-sm ${c.ok ? "" : "ring-1 ring-rose-300"}`}>
            <span className={c.ok ? "text-emerald-600" : "text-rose-600"}>{c.ok ? "✓" : "✗"}</span>
            <span className="text-gray-800">{c.name}</span>
            {!c.ok && c.detail && <span className="ml-auto truncate text-xs text-rose-500">{c.detail}</span>}
          </div>
        ))}
      </div>

      {/* lint 违规 */}
      {d.lint.length > 0 && (
        <>
          <h2 className="mt-8 text-h2 font-semibold text-rose-700">准入 lint 违规 · {d.lint.length}</h2>
          <div className="mt-3 space-y-1.5">
            {d.lint.map((v, i) => (
              <div key={i} className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700 shadow-sm">
                <b>{v.name}</b>[{v.code}] {v.chainId} · <code className="text-xs">{v.rule}</code>
                {v.detail && ` · ${v.detail}`}
              </div>
            ))}
          </div>
        </>
      )}

      <p className="mt-8 border-t border-gray-200 pt-4 text-xs leading-relaxed text-gray-400">
        观察期(2 交易日)每天看此面板。运行时项(resolver fallback / cache miss / 生产日志)脚本查不到,需生产监控。
        CLI 同源:<code className="rounded bg-gray-100 px-1">npx tsx scripts/resolver-health.ts</code> ·{" "}
        <code className="rounded bg-gray-100 px-1">scripts/relation-lint.ts</code> ·{" "}
        <code className="rounded bg-gray-100 px-1">scripts/resolver-samples.ts</code>
      </p>
    </div>
  );
}
