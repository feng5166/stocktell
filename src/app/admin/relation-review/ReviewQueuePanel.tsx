"use client";

// 层③ reviewQueue 审阅面板(2.1-W3):pending 列表 + confirm/reject。
// confirm 后的改档动作仍走 chain-relations.ts 代码评审(不变量#4),这里只记录人工结论。
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { RelationReviewRow } from "@/lib/relation-review";
import { postJson } from "@/lib/post-json";

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
  // 乐观更新(负责人实测:只靠 router.refresh() 在 RSC 缓存时序下不可靠,操作后列表不动)——
  // 本地持有列表,成功即时移除该条;refresh 仍触发,作为服务端最终一致的兜底。
  const [rows, setRows] = useState<RelationReviewRow[]>(items);
  // 负责人 2026-07-07 定夺:未覆盖票可提交(chainId=unmapped 作待收录容器)——配套给个
  // 筛选开关,把「关系复核」和「新标的收录建议」分开批量处理,噪声不混流。
  const [view, setView] = useState<"all" | "mapped" | "unmapped">("all");
  // W2(五轮 review):RSC 陈旧刷新会把已决行"复活"回列表——本会话内已终审的 id 永不回流
  const decided = useRef<Set<string>>(new Set());
  useEffect(() => setRows(items.filter((i) => !decided.current.has(i.id))), [items]);

  // 二轮 review N7:必须读响应——401/500 时此前静默刷新,条目看似处理了实则没落库、
  // 手输备注全丢。失败=显式报错+不刷新(备注留在输入框);note 恒传(空串=清空,undefined 才是不动)。
  async function act(id: string, status: "confirmed" | "rejected") {
    setBusy(id);
    setErr(null);
    try {
      const { res: r, data: d } = await postJson(
        "/api/admin/relation-review",
        { id, status, note: noteDraft[id] ?? "" },
        "PATCH"
      );
      if (!r.ok || !d.ok) {
        setErr(`操作失败(HTTP ${r.status}${d.error ? ` · ${d.error}` : ""}),未落库——请重试或重新登录`);
        return;
      }
      decided.current.add(id); // W2:标记已终审,陈旧刷新不得复活
      setRows((rs) => rs.filter((x) => x.id !== id)); // 乐观移除:已落库,立即从待审列表消失
      router.refresh();
    } catch (e) {
      setErr(`网络错误,未落库:${String(e)}`);
    } finally {
      setBusy(null);
    }
  }

  if (rows.length === 0) {
    return (
      <div className="mb-6 rounded-lg border border-dashed border-gray-300 bg-white px-4 py-6 text-center text-xs text-gray-400">
        审阅队列为空(复盘高频未验证 / 每日信号多次命中 / AI 审阅建议会自动进来)
      </div>
    );
  }
  const shown = rows.filter((it) =>
    view === "all" ? true : view === "unmapped" ? it.chainId === "unmapped" : it.chainId !== "unmapped"
  );
  const unmappedCount = rows.filter((it) => it.chainId === "unmapped").length;
  return (
    <div className="mb-6 space-y-2">
      {unmappedCount > 0 && (
        <div className="flex items-center gap-1.5 text-xs">
          {([
            ["all", `全部(${rows.length})`],
            ["mapped", `关系复核(${rows.length - unmappedCount})`],
            ["unmapped", `待收录建议(${unmappedCount})`],
          ] as const).map(([k, label]) => (
            <button
              key={k}
              onClick={() => setView(k)}
              className={`rounded px-2 py-0.5 ${view === k ? "bg-gray-900 text-white" : "bg-gray-100 text-gray-600 hover:bg-gray-200"}`}
            >
              {label}
            </button>
          ))}
        </div>
      )}
      {err && (
        <div className="rounded-lg bg-rose-50 px-3 py-2 text-xs text-rose-700">{err}</div>
      )}
      {shown.map((it) => (
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
              title="采纳该建议(记录结论;改档由维护者走 chain-relations.ts 代码评审落地)"
            >
              ✓ 采纳建议
            </button>
            <button
              disabled={busy === it.id}
              onClick={() => act(it.id, "rejected")}
              className="rounded border border-gray-300 px-2.5 py-1 text-xs text-gray-600 hover:bg-gray-100 disabled:opacity-50"
            >
              ✕ 驳回建议(维持现档)
            </button>
          </div>
        </div>
      ))}
      <p className="text-meta text-gray-400">
        采纳后改档仍走 chain-relations.ts 代码评审(队列不自动改 staticRelations);驳回只终结【该来源】的重复入队——其他来源(用户提交/AI/复盘)带新证据时仍会各自入队(按源分账,来源即证据类型)。
      </p>
    </div>
  );
}
