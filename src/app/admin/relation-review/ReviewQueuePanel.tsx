"use client";

// 层③ reviewQueue 审阅面板(2.1-W3):pending 列表 + confirm/reject。
// confirm 后的改档动作仍走 chain-relations.ts 代码评审(不变量#4),这里只记录人工结论。
import { useState } from "react";
import { useRouter } from "next/navigation";
import type { RelationReviewRow } from "@/lib/relation-review";

const REL_LABEL: Record<string, string> = {
  trigger: "触发源",
  direct: "直接映射",
  indirect: "间接映射",
  sentiment: "情绪映射",
  weak: "弱映射",
  candidate: "待验证",
};

export default function ReviewQueuePanel({ items }: { items: RelationReviewRow[] }) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [noteDraft, setNoteDraft] = useState<Record<string, string>>({});

  // 二轮 review N7:必须读响应——401/500 时此前静默刷新,条目看似处理了实则没落库、
  // 手输备注全丢。失败=显式报错+不刷新(备注留在输入框);note 恒传(空串=清空,undefined 才是不动)。
  async function act(id: string, status: "confirmed" | "rejected") {
    setBusy(id);
    setErr(null);
    try {
      const r = await fetch("/api/admin/relation-review", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, status, note: noteDraft[id] ?? "" }),
      });
      const d = await r.json().catch(() => ({ ok: false }));
      if (!r.ok || !d.ok) {
        setErr(`操作失败(HTTP ${r.status}${d.error ? ` · ${d.error}` : ""}),未落库——请重试或重新登录`);
        return;
      }
      router.refresh();
    } catch (e) {
      setErr(`网络错误,未落库:${String(e)}`);
    } finally {
      setBusy(null);
    }
  }

  if (items.length === 0) {
    return (
      <div className="mb-6 rounded-lg border border-dashed border-gray-300 bg-white px-4 py-6 text-center text-xs text-gray-400">
        审阅队列为空(复盘高频未验证 / 每日信号多次命中的关系会自动进来)
      </div>
    );
  }
  return (
    <div className="mb-6 space-y-2">
      {err && (
        <div className="rounded-lg bg-rose-50 px-3 py-2 text-xs text-rose-700">{err}</div>
      )}
      {items.map((it) => (
        <div key={it.id} className="rounded-lg bg-white p-3 shadow-sm">
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <span className="font-medium">{it.code}</span>
            <span className="rounded bg-gray-100 px-1.5 py-0.5 text-xs text-gray-600">{it.chainId}</span>
            {it.suggestedType && (
              <span className="rounded bg-amber-50 px-1.5 py-0.5 text-xs text-amber-700">
                建议:{REL_LABEL[it.suggestedType] ?? it.suggestedType}
              </span>
            )}
            <span className="text-xs text-gray-400">
              命中 {it.hitCount} 次 · {it.firstSeen} ~ {it.lastSeen} · 来源 {it.source}
            </span>
          </div>
          {it.reason && <p className="mt-1 text-xs leading-relaxed text-gray-500">{it.reason}</p>}
          <div className="mt-2 flex items-center gap-2">
            <input
              value={noteDraft[it.id] ?? ""}
              onChange={(e) => setNoteDraft((d) => ({ ...d, [it.id]: e.target.value }))}
              placeholder="审阅备注(仅审计,不上前台)"
              className="flex-1 rounded border border-gray-300 px-2 py-1 text-xs"
            />
            <button
              disabled={busy === it.id}
              onClick={() => act(it.id, "confirmed")}
              className="rounded bg-emerald-600 px-2.5 py-1 text-xs font-medium text-white hover:bg-emerald-700 disabled:opacity-50"
              title="确认需要调档:去 chain-relations.ts 走代码评审改档,队列只记录结论"
            >
              确认待调档
            </button>
            <button
              disabled={busy === it.id}
              onClick={() => act(it.id, "rejected")}
              className="rounded border border-gray-300 px-2.5 py-1 text-xs text-gray-600 hover:bg-gray-100 disabled:opacity-50"
            >
              维持现档
            </button>
          </div>
        </div>
      ))}
      <p className="text-meta text-gray-400">
        确认后改档仍走 chain-relations.ts 代码评审(队列不自动改 staticRelations);拒绝后同关系不再重复入队。
      </p>
    </div>
  );
}
