"use client";

// AI 审阅面板(2.2-C 对话能力试点):勾选关系(≤5/次)→ LLM 逐条给建议 → 自动入
// 审阅队列(source=ai-review,按源分账独立行)→ 在上方队列面板人工通过/拒绝。
// AI 只建议不改档;建议依据训练知识+库内信息,业务事实须人工核实——面板明示这一点。
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";

export type AiReviewRelation = {
  code: string;
  name: string;
  chainId: string;
  chainName: string;
  segmentName: string;
  relationType: string;
};

type Suggestion = {
  code: string;
  name: string;
  currentType: string;
  suggestedType: string;
  rationale: string;
  evidenceNeeded: string[];
  verificationPoints: string[];
  queued: boolean;
  error?: string;
};

export default function AiReviewPanel({ relations }: { relations: AiReviewRelation[] }) {
  const router = useRouter();
  const chains = useMemo(() => {
    const m = new Map<string, string>();
    for (const r of relations) m.set(r.chainId, r.chainName);
    return Array.from(m, ([id, name]) => ({ id, name }));
  }, [relations]);
  const [chain, setChain] = useState<string>(chains[0]?.id ?? "");
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [results, setResults] = useState<Suggestion[]>([]);

  const rows = useMemo(
    () => relations.filter((r) => r.chainId === chain && r.relationType !== "trigger"),
    [relations, chain]
  );

  function toggle(code: string) {
    setPicked((p) => {
      const n = new Set(p);
      if (n.has(code)) n.delete(code);
      else if (n.size < 5) n.add(code);
      return n;
    });
  }

  async function run() {
    setBusy(true);
    setErr(null);
    setResults([]);
    try {
      const r = await fetch("/api/admin/relation-review-ai", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ items: Array.from(picked).map((code) => ({ code, chainId: chain })) }),
      });
      const d = await r.json().catch(() => ({ ok: false }));
      if (!r.ok || !d.ok) {
        setErr(`AI 审阅失败(HTTP ${r.status}${d.error ? ` · ${d.error}` : ""})`);
        return;
      }
      setResults(d.suggestions ?? []);
      setPicked(new Set());
      router.refresh(); // 建议已入队,刷新上方队列面板
    } catch (e) {
      setErr(`网络错误:${String(e)}`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="mb-6 rounded-xl bg-white p-4 shadow-sm">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="text-sm font-semibold text-gray-700">🤖 AI 审阅</h2>
        <span className="text-xs text-gray-400">
          勾选(≤5)→ AI 按关系口径逐条建议 → 自动入上方队列,由你终审。AI 只建议不改档;业务事实(订单/客户/收入)以人工核实为准。
        </span>
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <select
          value={chain}
          onChange={(e) => {
            setChain(e.target.value);
            setPicked(new Set());
          }}
          className="rounded border border-gray-300 px-2 py-1 text-xs"
        >
          {chains.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
        <button
          onClick={run}
          disabled={busy || picked.size === 0}
          className="rounded bg-gray-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-gray-700 disabled:opacity-40"
        >
          {busy ? `AI 审阅中(${picked.size} 条,约 ${picked.size * 15}s)…` : `让 AI 审阅所选(${picked.size}/5)`}
        </button>
        {err && <span className="text-xs text-rose-500">{err}</span>}
      </div>
      <div className="mt-2 flex max-h-48 flex-wrap gap-1.5 overflow-y-auto">
        {rows.map((r) => (
          <button
            key={r.code}
            onClick={() => toggle(r.code)}
            className={`rounded border px-2 py-1 text-xs ${
              picked.has(r.code)
                ? "border-brand-400 bg-brand-50 text-brand-700"
                : "border-gray-200 text-gray-600 hover:bg-gray-50"
            }`}
            title={`${r.segmentName} · 现档 ${r.relationType}`}
          >
            {r.name} <span className="text-gray-400">{r.relationType}</span>
          </button>
        ))}
        {rows.length === 0 && <span className="text-xs text-gray-400">该链暂无可审关系(触发源不参与档位审阅)</span>}
      </div>
      {results.length > 0 && (
        <ul className="mt-3 space-y-2 border-t border-gray-100 pt-3">
          {results.map((s) => (
            <li key={s.code} className="text-xs leading-relaxed">
              <div className="flex flex-wrap items-center gap-1.5">
                <b className="text-gray-800">{s.name}</b>
                <span className="text-gray-400">{s.code}</span>
                {s.error ? (
                  <span className="text-rose-500">审阅失败:{s.error}</span>
                ) : (
                  <>
                    <span className="rounded bg-gray-100 px-1.5 py-0.5">现档 {s.currentType}</span>
                    <span className="rounded bg-amber-50 px-1.5 py-0.5 font-medium text-amber-700">
                      AI 建议 {s.suggestedType}
                    </span>
                    {s.queued && <span className="text-emerald-600">已入队 ✓</span>}
                  </>
                )}
              </div>
              {s.rationale && <p className="mt-0.5 text-gray-600">{s.rationale}</p>}
              {s.evidenceNeeded.length > 0 && (
                <p className="mt-0.5 text-gray-400">需人工核实:{s.evidenceNeeded.join("、")}</p>
              )}
              {s.verificationPoints.length > 0 && (
                <p className="mt-0.5 text-gray-400">建议验证点:{s.verificationPoints.join(" / ")}</p>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
