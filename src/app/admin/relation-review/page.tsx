import { requireAdmin } from "@/lib/admin";
import {
  allRelations,
  type StockChainRelation,
  type RelationType,
} from "@/data/chain-relations";

export const dynamic = "force-dynamic";

// P1 产业链关系模型审阅页(负责人过核定关系口径 + candidate 归属)。读实时 chain-relations.ts,
// 改数据源即时反映,不是静态快照。仅 admin 可见。
const TYPE_META: Record<RelationType, { label: string; cls: string; desc: string }> = {
  trigger: { label: "触发源", cls: "bg-indigo-100 text-indigo-700", desc: "美股/海外,事件触发源、非A股映射" },
  direct: { label: "直接映射", cls: "bg-rose-100 text-rose-700", desc: "短传导+明确业务入口" },
  indirect: { label: "间接映射", cls: "bg-amber-100 text-amber-700", desc: "隔一层/暴露不纯,需订单客户收入验证" },
  sentiment: { label: "情绪映射", cls: "bg-slate-100 text-slate-500", desc: "同主题联想,缺直接业务传导" },
  weak: { label: "弱映射", cls: "bg-gray-200 text-gray-500", desc: "关系远,只作外围观察" },
  candidate: { label: "待验证", cls: "bg-gray-100 text-gray-500", desc: "入候选池,证据不足未明确归档" },
};
const CONF: Record<string, string> = { high: "高", medium: "中", low: "低" };
const CONF_CLS: Record<string, string> = {
  high: "bg-rose-50 text-rose-600",
  medium: "bg-amber-50 text-amber-700",
  low: "bg-gray-100 text-gray-400",
};
const ORDER: RelationType[] = ["direct", "indirect", "sentiment", "weak", "candidate", "trigger"];

function RelRow({ r }: { r: StockChainRelation }) {
  return (
    <div className="rounded-lg bg-white p-2.5 px-3 shadow-sm">
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <span className="text-sm font-semibold text-gray-900">{r.name}</span>
        <span className="font-mono text-xs text-gray-400">{r.code}</span>
        <span className="ml-auto rounded bg-gray-100 px-1.5 py-0.5 text-[11px] text-gray-500">{r.segmentName}</span>
        <span className={`flex h-[18px] w-[18px] items-center justify-center rounded text-[11px] font-semibold ${CONF_CLS[r.confidence]}`} title="置信度">
          {CONF[r.confidence]}
        </span>
      </div>
      <p className="mt-1.5 text-xs leading-relaxed text-gray-500">{r.reason}</p>
    </div>
  );
}

function MiniChip({ r }: { r: StockChainRelation }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-md bg-white px-2 py-1 text-xs shadow-sm">
      <b className="font-semibold text-gray-800">{r.name}</b>
      <i className="font-mono text-[11px] not-italic text-gray-400">{r.code}</i>
      {r.segmentName && r.segmentName !== "海外事件触发源" && (
        <em className="rounded bg-gray-100 px-1 text-[11px] not-italic text-gray-500">{r.segmentName}</em>
      )}
    </span>
  );
}

export default async function RelationReviewPage() {
  await requireAdmin();
  const R = allRelations();

  const byChain = new Map<string, { name: string; rows: StockChainRelation[] }>();
  for (const r of R) {
    const g = byChain.get(r.chainId) ?? { name: r.chainName, rows: [] };
    g.rows.push(r);
    byChain.set(r.chainId, g);
  }

  return (
    <div className="mx-auto max-w-4xl px-4 py-8 sm:px-6">
      <h1 className="text-h1 font-semibold tracking-tight text-gray-900">P1 产业链关系模型 · 审阅</h1>
      <p className="mt-1.5 max-w-2xl text-sm leading-relaxed text-gray-500">
        统一数据源 <code className="rounded bg-gray-100 px-1 font-mono text-xs">chain-relations.ts</code> 从 insight / chain / 美股派生的{" "}
        <b className="text-gray-700">{R.length} 条</b>关系。与现有 <code className="rounded bg-gray-100 px-1 font-mono text-xs">relationForCodeInChain</code> 口径{" "}
        <b className="text-gray-700">0 漂移</b>。Phase 1 只建源、不碰页面;改数据源本页实时反映。
      </p>

      <div className="mt-4 rounded-xl bg-white p-4 text-sm leading-relaxed text-gray-500 shadow-sm">
        <b className="text-gray-800">你要过的:</b>① 核定关系段的 <b className="text-gray-700">关系档</b>(直接/间接/情绪/弱)与 <b className="text-gray-700">reason</b> 口径对不对;
        ② 待验证 candidate 里哪些该升级为核定、哪些该移出;③ 触发源是否都该是美股/海外。核定 = insight 人工核过,candidate = 链成分自动派生占位。
      </div>

      <div className="mt-3 flex flex-wrap gap-x-4 gap-y-2 rounded-xl bg-gray-50 p-4 text-xs">
        {ORDER.map((k) => (
          <span key={k} className="inline-flex items-center gap-1.5 text-gray-700">
            <span className={`inline-block h-2 w-2 rounded-full ${TYPE_META[k].cls}`} />
            {TYPE_META[k].label}
            <i className="not-italic text-gray-400">{TYPE_META[k].desc}</i>
          </span>
        ))}
      </div>

      {Array.from(byChain.entries()).map(([cid, chain]) => {
        const byType = new Map<RelationType, StockChainRelation[]>();
        for (const r of chain.rows) {
          const a = byType.get(r.relationType) ?? [];
          a.push(r);
          byType.set(r.relationType, a);
        }
        const core: RelationType[] = ["direct", "indirect", "sentiment", "weak"];
        return (
          <section key={cid} className="mt-10">
            <div className="flex items-baseline gap-3 border-b border-gray-200 pb-2">
              <h2 className="text-h2 font-semibold text-gray-900">{chain.name}</h2>
              <code className="font-mono text-xs text-brand-600">{cid}</code>
            </div>
            <div className="mt-2.5 flex flex-wrap gap-1.5">
              {ORDER.filter((k) => byType.get(k)?.length).map((k) => (
                <span key={k} className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${TYPE_META[k].cls}`}>
                  {TYPE_META[k].label} {byType.get(k)!.length}
                </span>
              ))}
            </div>

            <div className="mt-5 text-xs font-semibold uppercase tracking-wide text-gray-400">
              核定关系 · 请重点审关系档与 reason 口径
            </div>
            {core
              .filter((k) => byType.get(k)?.length)
              .map((k) => {
                const rows = byType.get(k)!;
                const bySeg = new Map<string, StockChainRelation[]>();
                for (const r of rows) {
                  const a = bySeg.get(r.segmentName) ?? [];
                  a.push(r);
                  bySeg.set(r.segmentName, a);
                }
                return (
                  <div key={k} className="mt-4">
                    <div className="flex items-center gap-2 text-sm font-semibold text-gray-800">
                      <span className={`inline-block h-2 w-2 rounded-full ${TYPE_META[k].cls}`} />
                      {TYPE_META[k].label} · {rows.length} 只
                      <span className="text-xs font-normal text-gray-400">{TYPE_META[k].desc}</span>
                    </div>
                    {Array.from(bySeg.entries()).map(([seg, srows]) => (
                      <div key={seg} className="mt-2.5 border-l-2 border-gray-100 pl-3">
                        <div className="mb-1.5 text-xs font-semibold text-gray-500">{seg}</div>
                        <div className="space-y-1.5">
                          {srows.map((r) => (
                            <RelRow key={r.code} r={r} />
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                );
              })}

            {byType.get("candidate")?.length ? (
              <details className="mt-5 border-t border-gray-100 pt-3">
                <summary className="cursor-pointer text-sm font-semibold text-gray-800">
                  待验证 candidate · {byType.get("candidate")!.length} 只
                  <span className="ml-2 text-xs font-normal text-gray-400">链成分、insight 未核定 → 可后续升级/降级</span>
                </summary>
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {byType.get("candidate")!.map((r) => (
                    <MiniChip key={r.code} r={r} />
                  ))}
                </div>
              </details>
            ) : null}

            {byType.get("trigger")?.length ? (
              <details className="mt-3 border-t border-gray-100 pt-3">
                <summary className="cursor-pointer text-sm font-semibold text-gray-800">
                  触发源 trigger · {byType.get("trigger")!.length} 只
                  <span className="ml-2 text-xs font-normal text-gray-400">美股/海外,事件触发源、非 A 股映射</span>
                </summary>
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {byType.get("trigger")!.map((r) => (
                    <MiniChip key={r.code} r={r} />
                  ))}
                </div>
              </details>
            ) : null}
          </section>
        );
      })}

      <p className="mt-10 border-t border-gray-200 pt-4 text-xs leading-relaxed text-gray-400">
        口径映射:直接→direct · 间接→indirect · 情绪映射→sentiment · 弱→weak · 美股→trigger · 链成分未核定→candidate。
        此页为 Phase 1 审阅件,过后进 Phase 2(接 /stocks 链环节筛选 + stock badge)。
      </p>
    </div>
  );
}
