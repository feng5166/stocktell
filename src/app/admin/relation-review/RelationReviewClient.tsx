"use client";

import { useEffect, useMemo, useState } from "react";
import type { StockChainRelation, RelationType } from "@/data/chain-relations";
import { AI_REVIEW_MAX_ITEMS } from "@/lib/ai-review-const";
import { postJson } from "@/lib/post-json";

// ============================================================================
// 关系模型人工校准工作台(负责人审阅台 · 第6步 4 功能)。
// ① 证据缺失高亮 ② 导出 diff(可回灌) ③ 改档快捷项 ④ reason inline 编辑。
// 编辑只在客户端 + localStorage(不落库);产出 = diff 导出,由我回灌 chain-relations-audit。
// ============================================================================

const REL_ORDER: RelationType[] = ["direct", "indirect", "sentiment", "weak", "candidate", "trigger"];
const REL_RANK: Record<RelationType, number> = { direct: 0, indirect: 1, sentiment: 2, weak: 3, candidate: 4, trigger: 5 };
const TYPE_META: Record<RelationType, { label: string; cls: string; btn: string }> = {
  direct: { label: "直接", cls: "bg-rose-100 text-rose-700", btn: "hover:bg-rose-50 hover:text-rose-700" },
  indirect: { label: "间接", cls: "bg-amber-100 text-amber-700", btn: "hover:bg-amber-50 hover:text-amber-700" },
  sentiment: { label: "情绪", cls: "bg-slate-100 text-slate-500", btn: "hover:bg-slate-100 hover:text-slate-600" },
  weak: { label: "弱", cls: "bg-gray-200 text-gray-500", btn: "hover:bg-gray-100 hover:text-gray-600" },
  candidate: { label: "待验证", cls: "bg-gray-100 text-gray-500", btn: "hover:bg-gray-100 hover:text-gray-600" },
  trigger: { label: "触发源", cls: "bg-indigo-100 text-indigo-700", btn: "hover:bg-indigo-50 hover:text-indigo-700" },
};

type Edit = { newType?: RelationType | "remove"; newReason?: string; action?: string; note?: string };
// 工作台内嵌 AI 审阅(负责人 2026-07-07:审阅台两处都要有 AI)——建议直接喂编辑态,
// 一键「按建议改档」进 diff 导出流;同时服务端仍入队(ai-review 行)留审计。
type AiSug = { suggestedType: string; rationale: string; analysis: string; evidenceNeeded: string[]; queued: boolean; error?: string };
type Flag = { level: "red" | "yellow" | null; msg: string };

// 证据缺失硬规则(负责人拍板,防关系库退化成"概念理由"):
// direct 缺证据/references=红;概念词无验证点=红(direct)/黄;reason 过短=黄;
// indirect 缺=黄;trigger 缺分组=黄;candidate=黄。
const CONCEPT_WORDS = /受益|机会|龙头|弹性|空间|景气/;
const VERIFY_HINT = /后续看|验证|订单|客户|收入|毛利|占比|交付|披露|财报|供货|营收/;
function evidenceFlag(r: StockChainRelation): Flag {
  const noRefs = !r.references || r.references.length === 0;
  const weakEv = !r.evidenceStatus || r.evidenceStatus === "needs_review" || r.evidenceStatus === "manual_only";
  // ① direct 缺证据(最高优先级)
  if (r.relationType === "direct" && (weakEv || noRefs))
    return { level: "red", msg: weakEv && noRefs ? "direct 无证据状态且无 references" : weakEv ? "direct 证据状态不足" : "direct 缺 references" };
  // ② 概念词无验证点(退化风险,仅查 A股映射理由;trigger 是海外定位不算):direct=红,其余=黄
  if (r.relationType !== "trigger" && CONCEPT_WORDS.test(r.reason) && !VERIFY_HINT.test(r.reason))
    return { level: r.relationType === "direct" ? "red" : "yellow", msg: "reason 含概念词(受益/龙头/空间…)但无验证点" };
  // ③ reason 过短
  if (r.reason.trim().length < 20 && r.relationType !== "trigger")
    return { level: "yellow", msg: "reason 过短(<20 字),不足以解释传导" };
  // ④ indirect 缺证据
  if (r.relationType === "indirect" && (weakEv || noRefs))
    return { level: "yellow", msg: "indirect 缺证据/references,需补订单/客户/收入" };
  // ⑤ trigger 缺分组
  if (r.relationType === "trigger" && !r.triggerGroup)
    return { level: "yellow", msg: "trigger 缺分组 triggerGroup" };
  // ⑥ candidate 待定
  if (r.relationType === "candidate")
    return { level: "yellow", msg: "candidate 待定 status(needs_evidence/needs_segment/duplicate/remove)" };
  return { level: null, msg: "" };
}

// 改档 → action 自动推断(direct/indirect/sentiment/weak 之间按强弱定 promote/downgrade;涉 trigger/candidate = retype)
function deriveAction(cur: RelationType, next: RelationType | "remove"): string {
  if (next === "remove") return "remove";
  if (next === cur) return "";
  const ranked = ["direct", "indirect", "sentiment", "weak"];
  if (ranked.includes(cur) && ranked.includes(next)) return REL_RANK[next] < REL_RANK[cur] ? "promote" : "downgrade";
  return "retype";
}
const refsOf = (e?: string) => (e === "verified" ? "available" : e === "partially_verified" ? "partial" : "none");

export default function RelationReviewClient({ relations }: { relations: StockChainRelation[] }) {
  const [edits, setEdits] = useState<Record<string, Edit>>({});
  const [hydrated, setHydrated] = useState(false);
  // 审核队列(负责人拍板:第一屏先展示需处理的风险项,不铺全量)。默认 = direct 缺证据。
  const [queue, setQueue] = useState<"direct-gap" | "candidate" | "trigger-ungrouped" | "changed" | "all">("direct-gap");
  const [editingReason, setEditingReason] = useState<string | null>(null);
  // C7 筛选维度(在队列之上再收窄)+ 批量选择
  const [fChain, setFChain] = useState("全部");
  const [fType, setFType] = useState("全部");
  const [fEvidence, setFEvidence] = useState("全部");
  const [fSource, setFSource] = useState("全部");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [ai, setAi] = useState<Record<string, AiSug>>({});
  const [aiBusy, setAiBusy] = useState(false);
  const [aiErr, setAiErr] = useState<string | null>(null);

  useEffect(() => {
    try {
      const s = localStorage.getItem("relReviewEdits");
      if (s) setEdits(JSON.parse(s));
    } catch {
      /* ignore */
    }
    setHydrated(true);
  }, []);
  useEffect(() => {
    if (hydrated) localStorage.setItem("relReviewEdits", JSON.stringify(edits));
  }, [edits, hydrated]);

  const keyOf = (r: StockChainRelation) => `${r.code}|${r.chainId}`;
  const patch = (r: StockChainRelation, p: Partial<Edit>) =>
    setEdits((e) => {
      const cur = e[keyOf(r)] ?? {};
      const next = { ...cur, ...p };
      // 全清空 → 删掉这条编辑
      if (!next.newType && !next.newReason && !next.action && !next.note) {
        const n = { ...e };
        delete n[keyOf(r)];
        return n;
      }
      return { ...e, [keyOf(r)]: next };
    });
  // AI 审阅所选(≤AI_REVIEW_MAX_ITEMS;trigger 由服务端过滤,这里也先剔掉给准确计数)
  async function runAiReview() {
    const picked = relations
      .filter((r) => selected.has(keyOf(r)) && r.relationType !== "trigger")
      .slice(0, AI_REVIEW_MAX_ITEMS);
    if (picked.length === 0) return;
    setAiBusy(true);
    setAiErr(null);
    try {
      const { res: resp, data: d } = await postJson<{ suggestions?: Array<AiSug & { code: string; chainId: string }> }>(
        "/api/admin/relation-review-ai",
        { items: picked.map((r) => ({ code: r.code, chainId: r.chainId })) }
      );
      if (!resp.ok || !d.ok) {
        setAiErr(`AI 审阅失败(HTTP ${resp.status}${d.error ? ` · ${d.error}` : ""})`);
        return;
      }
      const next: Record<string, AiSug> = {};
      for (const sug of d.suggestions ?? []) next[`${sug.code}|${sug.chainId}`] = sug;
      setAi((a) => ({ ...a, ...next }));
    } catch (e) {
      setAiErr(`网络错误:${String(e)}`);
    } finally {
      setAiBusy(false);
    }
  }

  const resetEdit = (r: StockChainRelation) =>
    setEdits((e) => {
      const n = { ...e };
      delete n[keyOf(r)];
      return n;
    });

  const hasChange = (ed?: Edit) => !!ed && !!(ed.newType || ed.newReason || ed.action);
  const changed = useMemo(() => relations.filter((r) => hasChange(edits[keyOf(r)])), [relations, edits]);
  const missingNote = changed.filter((r) => !edits[keyOf(r)]?.note?.trim());

  // diff dry-run 预览(#5):导出前先算清将改什么,确认再导出,防误操作。
  const dryRun = useMemo(() => {
    const byAction: Record<string, number> = {};
    let retype = 0,
      directDelta = 0,
      newDirectNoRef = 0;
    for (const r of changed) {
      const ed = edits[keyOf(r)]!;
      const action = ed.action || deriveAction(r.relationType, ed.newType ?? r.relationType) || (ed.newReason ? "edit_reason" : "");
      byAction[action] = (byAction[action] ?? 0) + 1;
      const removed = ed.newType === "remove";
      const newType = removed ? null : ed.newType ?? r.relationType;
      if (ed.newType && ed.newType !== r.relationType) retype++;
      const wasDirect = r.relationType === "direct";
      const isDirect = newType === "direct";
      if (wasDirect && !isDirect) directDelta--;
      if (!wasDirect && isDirect) {
        directDelta++;
        if (!r.references || r.references.length === 0) newDirectNoRef++;
      }
    }
    return { byAction, retype, directDelta, newDirectNoRef, removed: byAction["remove"] ?? 0, editReason: byAction["edit_reason"] ?? 0 };
  }, [changed, edits]);

  const evSummary = useMemo(() => {
    let red = 0,
      yellow = 0;
    for (const r of relations) {
      const f = evidenceFlag(r);
      if (f.level === "red") red++;
      else if (f.level === "yellow") yellow++;
    }
    return { red, yellow };
  }, [relations]);

  // 审核队列计数
  const qCount = useMemo(() => {
    const directGap = relations.filter((r) => r.relationType === "direct" && evidenceFlag(r).level === "red").length;
    const cand = relations.filter((r) => r.relationType === "candidate").length;
    const trigUng = relations.filter((r) => r.relationType === "trigger" && !r.triggerGroup).length;
    return { directGap, cand, trigUng };
  }, [relations]);

  const inQueue = (r: StockChainRelation) => {
    switch (queue) {
      case "direct-gap":
        return r.relationType === "direct" && evidenceFlag(r).level === "red";
      case "candidate":
        return r.relationType === "candidate";
      case "trigger-ungrouped":
        return r.relationType === "trigger" && !r.triggerGroup;
      case "changed":
        return hasChange(edits[keyOf(r)]);
      default:
        return true;
    }
  };

  // C7 筛选(在队列之上收窄)+ 批量
  const chainOpts = useMemo(() => Array.from(new Set(relations.map((r) => r.chainId))), [relations]);
  const passesFilters = (r: StockChainRelation) => {
    if (fChain !== "全部" && r.chainId !== fChain) return false;
    if (fType !== "全部" && r.relationType !== fType) return false;
    if (fEvidence !== "全部" && (r.evidenceStatus ?? "none") !== fEvidence) return false;
    if (fSource !== "全部" && r.source !== fSource) return false;
    return true;
  };
  const visibleRow = (r: StockChainRelation) => inQueue(r) && passesFilters(r);
  const applyBatch = (action: "needs_evidence" | "keep" | "remove") => {
    const patch: Partial<Edit> =
      action === "remove"
        ? { newType: "remove", action: "remove", note: "批量:移出待验证" }
        : action === "keep"
          ? { action: "keep", note: "批量:保留" }
          : { action: "needs_evidence", note: "批量:标记待补证据" };
    setEdits((e) => {
      const n = { ...e };
      for (const k of Array.from(selected)) n[k] = { ...n[k], ...patch };
      return n;
    });
    setSelected(new Set());
  };
  const toggleSel = (k: string) =>
    setSelected((s) => {
      const n = new Set(s);
      if (n.has(k)) n.delete(k);
      else n.add(k);
      return n;
    });

  // ---- 导出 diff(仅改动行;含 old/new 审计对 + 回灌所需列,可直接回灌)----
  function buildDiff(reviewedAt: string) {
    return changed.map((r) => {
      const ed = edits[keyOf(r)]!;
      const newType = ed.newType && ed.newType !== "remove" ? ed.newType : "";
      const action = ed.action || deriveAction(r.relationType, ed.newType ?? r.relationType) || (ed.newReason ? "edit_reason" : "");
      return {
        code: r.code,
        name: r.name,
        chainId: r.chainId,
        segmentId: r.segmentId,
        segment: r.segmentName,
        oldType: r.relationType,
        newType,
        oldReason: r.reason,
        newReason: ed.newReason ?? "",
        action,
        note: ed.note ?? "",
        evidenceStatus: r.evidenceStatus ?? "",
        refs: refsOf(r.evidenceStatus),
        triggerCat: r.triggerGroup ?? "",
        source: r.source,
        reviewedAt,
      };
    });
  }
  function download(name: string, content: string, type: string) {
    const blob = new Blob([content], { type });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = name;
    a.click();
    URL.revokeObjectURL(url);
  }
  function exportCSV() {
    const reviewedAt = new Date().toISOString();
    const H = ["code", "name", "chainId", "segmentId", "segment", "oldType", "newType", "oldReason", "newReason", "action", "note", "evidenceStatus", "refs", "triggerCat", "source", "reviewedAt"];
    const q = (s: unknown) => `"${String(s ?? "").replace(/"/g, '""')}"`;
    const rows = buildDiff(reviewedAt).map((d) =>
      [d.code, d.name, d.chainId, d.segmentId, d.segment, d.oldType, d.newType, d.oldReason, d.newReason, d.action, d.note, d.evidenceStatus, d.refs, d.triggerCat, d.source, d.reviewedAt].map(q).join(",")
    );
    download("relation-review-diff.csv", "﻿" + [H.map(q).join(","), ...rows].join("\r\n"), "text/csv;charset=utf-8");
  }
  function exportJSON() {
    const reviewedAt = new Date().toISOString();
    download("relation-review-diff.json", JSON.stringify({ count: changed.length, reviewedAt, rows: buildDiff(reviewedAt) }, null, 1), "application/json");
  }

  // ---- 分组:chain → relationType ----
  const byChain = useMemo(() => {
    const m = new Map<string, { name: string; rows: StockChainRelation[] }>();
    for (const r of relations) {
      const g = m.get(r.chainId) ?? { name: r.chainName, rows: [] };
      g.rows.push(r);
      m.set(r.chainId, g);
    }
    return m;
  }, [relations]);

  const QUEUES: { key: typeof queue; label: string; count: number; tone: string }[] = [
    { key: "direct-gap", label: "Direct 缺证据", count: qCount.directGap, tone: "text-rose-600" },
    { key: "candidate", label: "Candidate 待处理", count: qCount.cand, tone: "text-gray-600" },
    { key: "trigger-ungrouped", label: "Trigger 未分组", count: qCount.trigUng, tone: "text-amber-600" },
    { key: "changed", label: "最近变更待导出", count: changed.length, tone: "text-brand-600" },
    { key: "all", label: "全部列表", count: relations.length, tone: "text-gray-500" },
  ];

  return (
    <div className="mx-auto max-w-4xl px-4 py-6 sm:px-6">
      <h1 className="text-h1 font-semibold tracking-tight text-gray-900">关系模型 · 人工校准工作台</h1>
      <p className="mt-1 text-sm text-gray-500">
        读实时 <code className="rounded bg-gray-100 px-1 font-mono text-xs">staticRelations</code> · {relations.length} 条。第一屏 = 审核队列(先处理风险项),
        改档 / 改 reason 只存本地,产出 = 导出 diff → 我回灌。编辑不影响线上。
      </p>

      {/* 工具条(sticky) */}
      <div className="sticky top-0 z-10 -mx-4 mt-4 border-b border-gray-200 bg-canvas px-4 py-3 sm:-mx-6 sm:px-6">
        <div className="flex flex-wrap items-center gap-2">
          <span className="rounded-lg bg-brand-600 px-2.5 py-1 text-sm font-semibold text-white">{changed.length} 处改动</span>
          <button onClick={exportCSV} disabled={!changed.length} className="rounded-lg bg-gray-900 px-3 py-1.5 text-sm font-medium text-white disabled:opacity-40">
            ⬇ 导出 diff·CSV
          </button>
          <button onClick={exportJSON} disabled={!changed.length} className="rounded-lg bg-gray-100 px-3 py-1.5 text-sm font-medium text-gray-700 disabled:opacity-40">
            ⬇ JSON
          </button>
          {missingNote.length > 0 && <span className="rounded-lg bg-rose-50 px-2 py-1 text-xs font-medium text-rose-600">{missingNote.length} 处改动缺 note</span>}
          <span className="ml-auto flex items-center gap-3 text-xs">
            <span className="inline-flex items-center gap-1 text-rose-600">
              <span className="inline-block h-2 w-2 rounded-full bg-rose-500" />证据缺失 {evSummary.red}
            </span>
            <span className="inline-flex items-center gap-1 text-amber-600">
              <span className="inline-block h-2 w-2 rounded-full bg-amber-400" />待补 {evSummary.yellow}
            </span>
          </span>
        </div>
        {/* 审核队列切换 */}
        <div className="mt-2 flex flex-wrap items-center gap-1.5 text-xs">
          {QUEUES.map((q) => (
            <button
              key={q.key}
              onClick={() => setQueue(q.key)}
              className={`rounded-full px-2.5 py-1 font-medium ${queue === q.key ? "bg-brand-600 text-white" : "bg-gray-100 text-gray-600 hover:bg-gray-200"}`}
            >
              {q.label}
              <span className={`ml-1 ${queue === q.key ? "text-white/80" : q.tone}`}>{q.count}</span>
            </button>
          ))}
          {changed.length > 0 && (
            <button onClick={() => setEdits({})} className="ml-auto text-gray-400 hover:text-rose-600">
              清空所有改动
            </button>
          )}
        </div>
        {/* C7 筛选维度(队列之上再收窄) */}
        <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
          <FilterSel label="链" value={fChain} onChange={setFChain} opts={["全部", ...chainOpts]} />
          <FilterSel label="关系" value={fType} onChange={setFType} opts={["全部", "direct", "indirect", "sentiment", "weak", "trigger", "candidate"]} />
          <FilterSel label="证据" value={fEvidence} onChange={setFEvidence} opts={["全部", "verified", "partially_verified", "needs_review", "manual_only", "none"]} />
          <FilterSel label="来源" value={fSource} onChange={setFSource} opts={["全部", "insight", "manual", "chain", "auto_generated"]} />
        </div>
        {/* C7 批量标记(勾选行后出现) */}
        {selected.size > 0 && (
          <div className="mt-2 flex flex-wrap items-center gap-2 rounded-lg bg-amber-50 px-3 py-2 text-xs">
            <span className="font-semibold text-amber-800">已选 {selected.size} 条 · 批量标记</span>
            <button onClick={() => applyBatch("needs_evidence")} className="rounded bg-white px-2 py-1 font-medium text-gray-700 shadow-sm">待补证据</button>
            <button onClick={() => applyBatch("keep")} className="rounded bg-white px-2 py-1 font-medium text-gray-700 shadow-sm">保留</button>
            <button onClick={() => applyBatch("remove")} className="rounded bg-white px-2 py-1 font-medium text-rose-600 shadow-sm">移出</button>
            <button
              onClick={runAiReview}
              disabled={aiBusy}
              className="rounded bg-gray-900 px-2 py-1 font-medium text-white shadow-sm disabled:opacity-50"
              title={`对所选(≤${AI_REVIEW_MAX_ITEMS},触发源自动跳过)逐条给出建议档+判定过程,卡片内一键采纳进 diff`}
            >
              {aiBusy ? "🤖 AI 审阅中…" : "🤖 AI 审阅所选"}
            </button>
            {aiErr && <span className="text-rose-600">{aiErr}</span>}
            <button onClick={() => setSelected(new Set())} className="ml-auto text-gray-400 hover:text-gray-700">取消选择</button>
          </div>
        )}
      </div>

      {/* diff dry-run 预览(导出前先看清将改什么) */}
      {changed.length > 0 && (
        <div className="mt-4 rounded-xl bg-brand-50 p-4 shadow-sm ring-1 ring-brand-200">
          <div className="text-sm font-semibold text-brand-800">导出前预览 · dry-run · {changed.length} 处变更</div>
          <div className="mt-2 flex flex-wrap gap-x-5 gap-y-1 text-xs text-gray-700">
            <span>改档 <b>{dryRun.retype}</b></span>
            <span>移出 <b>{dryRun.removed}</b></span>
            <span>改 reason <b>{dryRun.editReason}</b></span>
            <span>
              direct 数量变化 <b>{dryRun.directDelta >= 0 ? "+" : ""}{dryRun.directDelta}</b>
            </span>
            <span>
              daily signals 影响:<b className="text-emerald-700">否</b>
            </span>
            {missingNote.length > 0 && <span className="font-medium text-rose-600">缺 note {missingNote.length}</span>}
            {dryRun.newDirectNoRef > 0 && (
              <span className="font-medium text-rose-600">⚠ {dryRun.newDirectNoRef} 条新 direct 缺 references(回灌后会亮红旗)</span>
            )}
          </div>
          <div className="mt-1.5 text-[11px] text-gray-400">
            确认无误后点上方「导出 diff」。导出 = 只产生 diff 文件、不改线上;回灌由负责人确认后进行。
          </div>
        </div>
      )}

      {QUEUES.find((q) => q.key === queue)?.count === 0 && (
        <div className="mt-8 rounded-xl bg-white p-6 text-center text-sm text-gray-500 shadow-sm">
          ✓ 「{QUEUES.find((q) => q.key === queue)?.label}」队列已清空,无待处理项。切到其他队列或「全部列表」继续。
        </div>
      )}

      {Array.from(byChain.entries()).map(([cid, chain]) => {
        const rows = chain.rows.filter(visibleRow).sort((a, b) => REL_RANK[a.relationType] - REL_RANK[b.relationType]);
        if (!rows.length) return null;
        return (
          <section key={cid} className="mt-6">
            <div className="flex items-baseline gap-3 border-b border-gray-200 pb-2">
              <h2 className="text-h2 font-semibold text-gray-900">{chain.name}</h2>
              <code className="font-mono text-xs text-brand-600">{cid}</code>
              <span className="text-xs text-gray-400">{rows.length} 条</span>
            </div>
            <div className="mt-3 space-y-2">
              {rows.map((r) => (
                <Row
                  key={keyOf(r)}
                  r={r}
                  edit={edits[keyOf(r)]}
                  flag={evidenceFlag(r)}
                  editing={editingReason === keyOf(r)}
                  onType={(t) => patch(r, { newType: t === r.relationType ? undefined : t, action: deriveAction(r.relationType, t) })}
                  onReason={(v) => patch(r, { newReason: v === r.reason ? undefined : v })}
                  onNote={(v) => patch(r, { note: v })}
                  onEditReason={() => setEditingReason(editingReason === keyOf(r) ? null : keyOf(r))}
                  onReset={() => resetEdit(r)}
                  sel={selected.has(keyOf(r))}
                  onSel={() => toggleSel(keyOf(r))}
                  aiSug={ai[keyOf(r)]}
                  onAdoptAi={() => {
                    const sug = ai[keyOf(r)];
                    if (!sug) return;
                    const t = sug.suggestedType as RelationType | "remove";
                    patch(r, {
                      newType: t === r.relationType ? undefined : t,
                      action: deriveAction(r.relationType, t),
                      note: edits[keyOf(r)]?.note || "采纳 AI 审阅建议(判定过程见队列 ai-review 行)",
                    });
                  }}
                />
              ))}
            </div>
          </section>
        );
      })}

      <p className="mt-8 border-t border-gray-200 pt-4 text-xs leading-relaxed text-gray-400">
        变更历史(审计日志)见 <code className="rounded bg-gray-100 px-1">docs/relation-changelog.md</code>(每次回灌追加)。
        回灌前跑 <code className="rounded bg-gray-100 px-1">resolver-health</code> / <code className="rounded bg-gray-100 px-1">relation-lint</code> /{" "}
        <code className="rounded bg-gray-100 px-1">resolver-samples</code> 全过 · 健康面板 <a href="/admin/resolver-health" className="text-brand-600 hover:underline">/admin/resolver-health</a>。
      </p>
    </div>
  );
}

function FilterSel({ label, value, onChange, opts }: { label: string; value: string; onChange: (v: string) => void; opts: string[] }) {
  return (
    <label className="inline-flex items-center gap-1 text-gray-500">
      {label}
      <select value={value} onChange={(e) => onChange(e.target.value)} className="rounded border border-gray-300 bg-white px-1.5 py-1 text-xs outline-none focus:border-brand-500">
        {opts.map((o) => (
          <option key={o} value={o}>
            {o}
          </option>
        ))}
      </select>
    </label>
  );
}

function Row({
  r,
  edit,
  flag,
  editing,
  onType,
  onReason,
  onNote,
  onEditReason,
  onReset,
  sel,
  onSel,
  aiSug,
  onAdoptAi,
}: {
  r: StockChainRelation;
  edit?: Edit;
  flag: Flag;
  editing: boolean;
  onType: (t: RelationType | "remove") => void;
  onReason: (v: string) => void;
  onNote: (v: string) => void;
  onEditReason: () => void;
  aiSug?: AiSug;
  onAdoptAi?: () => void;
  onReset: () => void;
  sel: boolean;
  onSel: () => void;
}) {
  const changed = !!(edit?.newType || edit?.newReason || edit?.action);
  const noteMissing = changed && !edit?.note?.trim();
  const ring =
    flag.level === "red" ? "ring-1 ring-rose-300" : flag.level === "yellow" ? "ring-1 ring-amber-200" : "";
  const changedRing = changed ? "ring-2 ring-brand-400" : ring;
  return (
    <div className={`rounded-lg bg-white p-2.5 px-3 shadow-sm ${changedRing}`}>
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <input type="checkbox" checked={sel} onChange={onSel} className="h-3.5 w-3.5 shrink-0 accent-brand-600" title="选中做批量标记" />
        <span className={`rounded px-1.5 py-0.5 text-[11px] font-medium ${TYPE_META[r.relationType].cls}`}>{TYPE_META[r.relationType].label}</span>
        <span className="text-sm font-semibold text-gray-900">{r.name}</span>
        <span className="font-mono text-xs text-gray-400">{r.code}</span>
        {r.triggerGroup && <span className="rounded bg-indigo-50 px-1.5 text-[10px] text-indigo-600">{r.triggerGroup}</span>}
        {flag.level && (
          <span className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${flag.level === "red" ? "bg-rose-50 text-rose-600" : "bg-amber-50 text-amber-700"}`} title={flag.msg}>
            ⚠ {flag.level === "red" ? "证据缺失" : "待补"}
          </span>
        )}
        <span className="ml-auto rounded bg-gray-100 px-1.5 py-0.5 text-[11px] text-gray-500">{r.segmentName}</span>
      </div>

      {/* reason */}
      {editing ? (
        <textarea
          defaultValue={edit?.newReason ?? r.reason}
          onBlur={(e) => onReason(e.target.value.trim())}
          rows={2}
          autoFocus
          className="mt-1.5 w-full rounded border border-gray-300 p-1.5 text-xs outline-none focus:border-brand-500"
        />
      ) : (
        <p className="mt-1 cursor-text text-xs leading-relaxed text-gray-500" onClick={onEditReason} title="点击编辑 reason">
          {edit?.newReason ? <span className="text-brand-700">✎ {edit.newReason}</span> : r.reason}
        </p>
      )}

      {/* AI 审阅建议(勾选后点批量条「AI 审阅所选」出现;采纳=直接写进编辑态进 diff 流) */}
      {aiSug && (
        <div className="mt-2 rounded-lg bg-indigo-50/60 px-2.5 py-2 text-xs leading-relaxed ring-1 ring-indigo-100">
          {aiSug.error ? (
            <span className="text-rose-500">🤖 审阅失败:{aiSug.error}</span>
          ) : (
            <>
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="font-medium text-indigo-700">🤖 AI 建议:{aiSug.suggestedType}</span>
                <span className="text-gray-600">{aiSug.rationale}</span>
                {onAdoptAi && (
                  <button
                    onClick={onAdoptAi}
                    className="ml-auto rounded bg-indigo-600 px-2 py-0.5 text-[11px] font-medium text-white hover:bg-indigo-700"
                    title="把建议档写入本地编辑(可撤销;仍需导出 diff → 回灌)"
                  >
                    按建议改档
                  </button>
                )}
              </div>
              {aiSug.analysis && (
                <p className="mt-1 text-gray-600">
                  <span className="text-gray-400">判定过程:</span>
                  {aiSug.analysis}
                </p>
              )}
              {aiSug.evidenceNeeded?.length > 0 && (
                <p className="mt-0.5 text-gray-400">需人工核实:{aiSug.evidenceNeeded.join("、")}</p>
              )}
            </>
          )}
        </div>
      )}

      {/* 改档快捷项 */}
      <div className="mt-2 flex flex-wrap items-center gap-1">
        <span className="text-[10px] text-gray-400">改档</span>
        {REL_ORDER.map((t) => (
          <button
            key={t}
            onClick={() => onType(t)}
            className={`rounded px-1.5 py-0.5 text-[11px] font-medium transition ${
              edit?.newType === t ? TYPE_META[t].cls + " ring-1 ring-brand-400" : `bg-gray-50 text-gray-500 ${TYPE_META[t].btn}`
            }`}
          >
            {TYPE_META[t].label}
          </button>
        ))}
        <button
          onClick={() => onType("remove")}
          className={`rounded px-1.5 py-0.5 text-[11px] font-medium ${edit?.newType === "remove" ? "bg-rose-600 text-white" : "bg-gray-50 text-gray-400 hover:bg-rose-50 hover:text-rose-600"}`}
        >
          移出
        </button>
        {!editing && (
          <button onClick={onEditReason} className="rounded px-1.5 py-0.5 text-[11px] text-gray-400 hover:bg-gray-100 hover:text-gray-700">
            改 reason
          </button>
        )}
        {changed && (
          <button onClick={onReset} className="ml-auto text-[11px] text-gray-300 hover:text-rose-600">
            撤销
          </button>
        )}
      </div>

      {/* note(改动后必填)*/}
      {changed && (
        <input
          value={edit?.note ?? ""}
          onChange={(e) => onNote(e.target.value)}
          placeholder="必填:为什么改(note / reason 依据)"
          className={`mt-1.5 w-full rounded border p-1.5 text-xs outline-none ${noteMissing ? "border-rose-300 bg-rose-50 focus:border-rose-500" : "border-gray-300 focus:border-brand-500"}`}
        />
      )}
    </div>
  );
}
