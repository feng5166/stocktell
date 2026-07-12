"use client";

// 链级每日推理审核页(PRD §6)。字段级编辑:judgment/risk/heat(direction/reason)/
// mappings(todayWhy/verify)/references(supports/删)/confidence;relation 只读(红线)。
// 动作:保存 / 发布 / 打回 / 重新生成。
import { useCallback, useEffect, useState } from "react";
import type { DailyInsightPayload } from "@/lib/insight-pipeline/schema";
import type { GuardResult } from "@/lib/insight-pipeline/guard";

interface DocRow {
  id: string;
  slug: string;
  chainId: string;
  date: string;
  kind: string;
  status: string;
  payload: DailyInsightPayload;
  guard: GuardResult | null;
  reviewNote: string | null;
  createdAt: string;
}

const STATUS_CLS: Record<string, string> = {
  draft: "bg-amber-100 text-amber-700",
  published: "bg-emerald-100 text-emerald-700",
  rejected: "bg-rose-100 text-rose-600",
  superseded: "bg-gray-100 text-gray-400",
};

export default function AdminInsightsClient() {
  const [items, setItems] = useState<DocRow[]>([]);
  const [sel, setSel] = useState<DocRow | null>(null);
  const [draft, setDraft] = useState<DailyInsightPayload | null>(null);
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const r = await fetch("/api/admin/insights", { cache: "no-store" });
    const d = await r.json();
    if (d.ok) setItems(d.items);
  }, []);
  useEffect(() => {
    load();
  }, [load]);

  const open = (row: DocRow) => {
    setSel(row);
    setDraft(structuredClone(row.payload));
    setMsg("");
  };

  const regen = async () => {
    setBusy(true);
    setMsg("重新生成中…");
    try {
      const r = await fetch(`/api/admin/insight-daily?force=1&date=${sel?.date}&chain=${sel?.chainId}`, {
        method: "POST",
      });
      const d = await r.json();
      setMsg(d.ok ? `已生成新草稿 ${d.slug}` : `失败:${d.blocked ? d.blockers?.join(";") : d.error}`);
      await load();
    } finally {
      setBusy(false);
    }
  };

  const submit = async (action: "save" | "publish" | "reject") => {
    if (!sel || !draft) return;
    if (action === "reject") {
      const note = prompt("打回原因(必填):");
      if (!note?.trim()) return;
      setBusy(true);
      const r = await fetch("/api/admin/insights", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: sel.id, action, note }),
      });
      const d = await r.json();
      setMsg(d.ok ? "已打回" : `失败:${d.error}`);
      setBusy(false);
      if (d.ok) {
        setSel(null);
        await load();
      }
      return;
    }
    setBusy(true);
    const r = await fetch("/api/admin/insights", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: sel.id, action, payload: draft }),
    });
    const d = await r.json();
    setMsg(d.ok ? (action === "publish" ? "✅ 已发布上线" : "已保存") : `失败:${d.error}${d.errs ? " · " + d.errs.join(";") : ""}`);
    setBusy(false);
    if (d.ok) await load();
  };

  const set = <K extends keyof DailyInsightPayload>(k: K, v: DailyInsightPayload[K]) =>
    setDraft((p) => (p ? { ...p, [k]: v } : p));

  return (
    <div className="text-ink">
      <div className="mx-auto max-w-4xl px-4 py-6 sm:px-6">
        <h1 className="mb-3 text-lg font-semibold">链级每日推理 · 审发</h1>

        {/* 列表 */}
        {!sel && (
          <div className="space-y-2">
            {items.length === 0 && (
              <div className="rounded-lg border border-dashed border-gray-300 bg-white px-4 py-8 text-center text-sm text-gray-400">
                暂无推理。等 07:05 cron,或 POST /api/admin/insight-daily?force=1 手动生成。
              </div>
            )}
            {items.map((it) => {
              const g = it.guard;
              const gLabel = !g ? "" : g.blockers.length ? `⛔${g.blockers.length}` : g.warnings.length ? `⚠️${g.warnings.length}` : "✓";
              return (
                <button
                  key={it.id}
                  onClick={() => open(it)}
                  className="flex w-full items-center gap-2 rounded-lg bg-white px-4 py-3 text-left shadow-sm hover:bg-gray-50"
                >
                  <span className={`rounded px-1.5 py-0.5 text-[11px] font-medium ${STATUS_CLS[it.status] ?? "bg-gray-100"}`}>
                    {it.status}
                  </span>
                  <span className="text-sm font-medium">{it.date}</span>
                  <span className="text-xs text-gray-400">{it.chainId} · {it.kind}</span>
                  <span className="truncate text-xs text-gray-500">{it.payload?.judgment?.slice(0, 40)}</span>
                  <span className="ml-auto text-xs text-gray-400">{gLabel}</span>
                </button>
              );
            })}
          </div>
        )}

        {/* 编辑 */}
        {sel && draft && (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center gap-2">
              <button onClick={() => setSel(null)} className="text-xs text-gray-500 hover:text-gray-900">← 返回列表</button>
              <span className={`rounded px-1.5 py-0.5 text-[11px] font-medium ${STATUS_CLS[sel.status]}`}>{sel.status}</span>
              <span className="text-sm font-medium">{sel.date} · {sel.chainId}</span>
              {msg && <span className="text-xs text-gray-500">{msg}</span>}
            </div>

            {/* 护栏明细 */}
            {sel.guard && (sel.guard.blockers.length > 0 || sel.guard.warnings.length > 0) && (
              <div className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">
                {sel.guard.blockers.map((b, i) => <div key={"b" + i}>⛔ {b}</div>)}
                {sel.guard.warnings.map((w, i) => <div key={"w" + i}>⚠️ {w}</div>)}
                <div className="mt-1 text-amber-600">
                  LLM {sel.guard.detail.llmCalls} 次 · 检索 {sel.guard.detail.searchCalls} 次 · references {sel.guard.detail.refsVerified}/{sel.guard.detail.refsTotal} 可达
                </div>
              </div>
            )}

            <Field label="今日触发(只读)">
              <div className="text-sm text-gray-700">{draft.trigger.summary}</div>
            </Field>

            <Field label="链级今日判断">
              <textarea
                value={draft.judgment}
                onChange={(e) => set("judgment", e.target.value)}
                rows={4}
                className="w-full rounded border border-gray-300 px-2 py-1.5 text-sm"
              />
              <span className="text-[11px] text-gray-400">{draft.judgment.length} 字(30~200)</span>
            </Field>

            <Field label="环节热力(relation 只读)">
              <div className="space-y-1.5">
                {draft.heat.map((h, i) => (
                  <div key={h.segment} className="flex flex-wrap items-center gap-1.5 rounded bg-gray-50 px-2 py-1.5">
                    <span className="w-32 shrink-0 text-xs font-medium">{h.segment}</span>
                    <select
                      value={h.direction}
                      onChange={(e) => {
                        const heat = [...draft.heat];
                        heat[i] = { ...h, direction: e.target.value as typeof h.direction };
                        set("heat", heat);
                      }}
                      className="rounded border border-gray-300 px-1 py-0.5 text-xs"
                    >
                      {["升温", "降温", "分化", "观察"].map((d) => <option key={d}>{d}</option>)}
                    </select>
                    <span className="rounded bg-gray-200 px-1 py-0.5 text-[10px] text-gray-500">{h.relation}</span>
                    <input
                      value={h.reason}
                      onChange={(e) => {
                        const heat = [...draft.heat];
                        heat[i] = { ...h, reason: e.target.value };
                        set("heat", heat);
                      }}
                      className="min-w-0 flex-1 rounded border border-gray-300 px-2 py-0.5 text-xs"
                    />
                  </div>
                ))}
              </div>
            </Field>

            <Field label={`今日映射变化(${draft.mappingsDelta.length};relation 只读)`}>
              <div className="space-y-1.5">
                {draft.mappingsDelta.map((m, i) => (
                  <div key={m.code} className="rounded bg-gray-50 px-2 py-1.5">
                    <div className="flex items-center gap-1.5">
                      <span className="text-xs font-medium">{m.name}</span>
                      <span className="text-[10px] text-gray-400">{m.segment}</span>
                      <span className="rounded bg-gray-200 px-1 py-0.5 text-[10px] text-gray-500">{m.relation}</span>
                    </div>
                    <input
                      value={m.todayWhy}
                      onChange={(e) => {
                        const md = [...draft.mappingsDelta];
                        md[i] = { ...m, todayWhy: e.target.value };
                        set("mappingsDelta", md);
                      }}
                      className="mt-1 w-full rounded border border-gray-300 px-2 py-0.5 text-xs"
                    />
                    <input
                      value={m.verify.join(" / ")}
                      onChange={(e) => {
                        const md = [...draft.mappingsDelta];
                        md[i] = { ...m, verify: e.target.value.split("/").map((s) => s.trim()).filter(Boolean).slice(0, 3) };
                        set("mappingsDelta", md);
                      }}
                      className="mt-1 w-full rounded border border-gray-300 px-2 py-0.5 text-[11px] text-gray-500"
                      placeholder="验证点,用 / 分隔"
                    />
                  </div>
                ))}
              </div>
            </Field>

            <Field label="今日一句话风险">
              <textarea value={draft.risk} onChange={(e) => set("risk", e.target.value)} rows={2} className="w-full rounded border border-gray-300 px-2 py-1.5 text-sm" />
            </Field>

            <Field label={`references(${draft.references.filter((r) => r.verified).length}/${draft.references.length} 可达)`}>
              <div className="space-y-1">
                {draft.references.map((r, i) => {
                  // PR3 v1/v2 双读:v2 编辑 supportsText,v1 编辑 supports(改哪个字段跟形状走,不混写)
                  const v2 = "supportsText" in r;
                  return (
                    <div key={i} className="flex items-center gap-1.5 text-xs">
                      <span className={r.verified ? "text-emerald-600" : "text-rose-500"}>{r.verified ? "✓" : "✗"}</span>
                      <a href={r.url} target="_blank" rel="noreferrer" className="w-40 shrink-0 truncate text-brand-600 hover:underline">{r.name}</a>
                      <input
                        value={v2 ? r.supportsText : r.supports}
                        onChange={(e) => {
                          const refs = [...draft.references];
                          refs[i] = v2 ? { ...r, supportsText: e.target.value } : { ...r, supports: e.target.value };
                          set("references", refs);
                        }}
                        className="min-w-0 flex-1 rounded border border-gray-300 px-2 py-0.5 text-[11px]"
                      />
                      <button
                        onClick={() => set("references", draft.references.filter((_, j) => j !== i))}
                        className="text-rose-400 hover:text-rose-600"
                      >删</button>
                    </div>
                  );
                })}
              </div>
            </Field>

            <Field label="置信度(「高」只能人审给)">
              <select value={draft.confidence} onChange={(e) => set("confidence", e.target.value as DailyInsightPayload["confidence"])} className="rounded border border-gray-300 px-2 py-1 text-sm">
                {["低", "中", "高"].map((c) => <option key={c}>{c}</option>)}
              </select>
            </Field>

            <div className="sticky bottom-0 flex flex-wrap gap-2 border-t border-gray-200 bg-canvas py-3">
              <button disabled={busy} onClick={() => submit("publish")} className="rounded bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-50">发布上线</button>
              <button disabled={busy} onClick={() => submit("save")} className="rounded bg-gray-100 px-3 py-2 text-sm hover:bg-gray-200 disabled:opacity-50">保存草稿</button>
              <button disabled={busy} onClick={() => submit("reject")} className="rounded px-3 py-2 text-sm text-rose-500 hover:bg-rose-50 disabled:opacity-50">打回</button>
              <button disabled={busy} onClick={regen} className="ml-auto rounded border border-gray-300 px-3 py-2 text-sm text-gray-600 hover:bg-gray-100 disabled:opacity-50">重新生成</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl bg-white p-3 shadow-sm">
      <div className="mb-1.5 text-xs font-medium text-gray-500">{label}</div>
      {children}
    </div>
  );
}
