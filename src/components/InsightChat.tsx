"use client";
// 情境式追问 · 前端(PRD prd-trust-chat-pro-intent §5,PR4)。
// 形态:锚点旁小按钮(AskButton)→ CustomEvent 唤起页面级面板(InsightChatPanel,每页一个);
// 桌面右侧面板 / 移动端底部抽屉;面板顶部始终显示 链·日期·锚点(§5.1)。
// 回答按 GroundedAnswer 合同渲染:一句话 → 最多三点 → 引用 → 不确定性;免责由本层固定追加。
// 埋点只传枚举/计数,严禁传问题与回答正文(§7)。
import { useCallback, useEffect, useRef, useState } from "react";
import { track } from "@/lib/analytics";

type Anchor = { type: "judgment" | "risk" | "hop" | "heat" | "mapping"; id: string; label: string };
type Answer = {
  oneLiner: string;
  explanation: string[];
  referenceIds: string[];
  uncertainty: string;
  result: "grounded" | "no_evidence" | "redirected";
};
type RefOut = { id: string; name: string; url?: string };
type Turn = { q: string; a?: Answer; refs?: RefOut[]; error?: string };

const EVT = "stocktell:ask";

export function AskButton({ anchor }: { anchor: Anchor }) {
  return (
    <button
      type="button"
      className="rounded px-1.5 py-0.5 text-[11px] text-brand-500 transition-colors hover:bg-brand-50 hover:text-brand-700"
      onClick={() => window.dispatchEvent(new CustomEvent(EVT, { detail: anchor }))}
    >
      💬 追问
    </button>
  );
}

// 推荐问题(§5.2;自选相关问题由服务端上下文覆盖,前端固定列表)
const SUGGESTS = [
  "这一步最关键的依据是什么?",
  "哪个前提不成立时,这条链会断?",
  "这是直接关系,还是市场情绪映射?",
  "有什么相反证据或容易误判的地方?",
  "我的自选里哪些和这一步有关?",
];

export function InsightChatPanel({
  insightId,
  date,
  chainTitle,
}: {
  insightId: string;
  date?: string;
  chainTitle: string;
}) {
  const [anchor, setAnchor] = useState<Anchor | null>(null);
  const [turns, setTurns] = useState<Turn[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [quota, setQuota] = useState<{ used: number; limit: number } | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onAsk = (e: Event) => {
      const a = (e as CustomEvent<Anchor>).detail;
      setAnchor(a);
      setTurns([]);
      setNotice(null);
      track("chat_open", { insight_id: insightId, ...(date ? { date } : {}), anchor_type: a.type });
    };
    window.addEventListener(EVT, onAsk);
    return () => window.removeEventListener(EVT, onAsk);
  }, [insightId, date]);

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight });
  }, [turns]);

  const submit = useCallback(
    async (q: string) => {
      if (!anchor || busy) return;
      const question = q.trim();
      if (question.length < 2) return;
      setBusy(true);
      setNotice(null);
      setInput("");
      setTurns((t) => [...t, { q: question }]);
      const t0 = Date.now();
      try {
        const r = await fetch("/api/insight-chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            slug: insightId,
            date,
            anchor: { type: anchor.type, id: anchor.id },
            question,
          }),
        });
        const j = await r.json().catch(() => ({}));
        const latency = Date.now() - t0;
        const bucket = latency < 3000 ? "<3s" : latency < 8000 ? "3-8s" : latency < 15000 ? "8-15s" : ">15s";
        if (r.ok && j.answer) {
          setQuota(j.quota ?? null);
          setTurns((t) => [...t.slice(0, -1), { q: question, a: j.answer, refs: j.references }]);
          track("chat_question_submit", {
            insight_id: insightId,
            anchor_type: anchor.type,
            turn_no: turns.length + 1,
            intent_class: String(j.intent ?? "pass"),
          });
          track("chat_answer_result", {
            result: j.answer.result,
            reference_count: (j.references ?? []).length,
            latency_bucket: bucket,
            provider: String(j.provider ?? ""),
          });
          // PR5 轻入口信号:完成一次追问(回答到手后才发,不打断对话)
          window.dispatchEvent(new CustomEvent("stocktell:deep-engaged", { detail: { trigger: "chat" } }));
        } else if (r.status === 401) {
          setTurns((t) => t.slice(0, -1));
          setNotice("追问需要先登录(右上角登录后再来)。");
        } else if (r.status === 429) {
          setTurns((t) => t.slice(0, -1));
          setNotice(`今天的 ${j.limit ?? 10} 次追问已用完,明天再来。`);
          track("chat_quota_reached", {});
        } else if (r.status === 409) {
          setTurns((t) => t.slice(0, -1));
          setNotice("上一个问题还在回答中,稍等一下。");
        } else if (r.status === 503 && j.retryable) {
          setTurns((t) => [...t.slice(0, -1), { q: question, error: "AI 暂时不可用,本次不计额度,请稍后重试。" }]);
        } else {
          setTurns((t) => [...t.slice(0, -1), { q: question, error: "出错了,请稍后再试。" }]);
        }
      } catch {
        setTurns((t) => [...t.slice(0, -1), { q: question, error: "网络异常,请稍后再试。" }]);
      } finally {
        setBusy(false);
      }
    },
    [anchor, busy, insightId, date, turns.length]
  );

  if (!anchor) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-end bg-black/20 sm:items-stretch" onClick={() => setAnchor(null)}>
      <div
        className="flex h-[78vh] w-full flex-col rounded-t-2xl bg-white shadow-xl sm:h-full sm:w-[26rem] sm:rounded-none"
        onClick={(e) => e.stopPropagation()}
      >
        {/* 顶部:链 · 日期 · 锚点(始终可见,§5.1) */}
        <div className="border-b border-gray-100 px-4 py-3">
          <div className="flex items-center justify-between gap-2">
            <p className="text-xs font-medium text-brand-600">
              💬 追问 · {chainTitle}
              {date ? ` · ${date}` : ""}
            </p>
            <button className="text-gray-400 hover:text-gray-600" onClick={() => setAnchor(null)}>
              ✕
            </button>
          </div>
          <p className="mt-0.5 text-[11px] text-gray-500">锚点:{anchor.label}</p>
        </div>

        <div ref={listRef} className="flex-1 space-y-3 overflow-y-auto px-4 py-3">
          {turns.length === 0 && (
            <div>
              <p className="text-xs text-gray-400">可以这样问(只聊产业链解释与验证,不聊买卖):</p>
              <div className="mt-1.5 space-y-1">
                {SUGGESTS.map((s) => (
                  <button
                    key={s}
                    className="block w-full rounded-lg bg-gray-50 px-2.5 py-1.5 text-left text-xs text-gray-600 hover:bg-brand-50"
                    onClick={() => submit(s)}
                    disabled={busy}
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>
          )}
          {turns.map((t, i) => (
            <div key={i} className="space-y-1.5">
              <p className="ml-8 rounded-lg bg-brand-50 px-2.5 py-1.5 text-xs text-gray-700">{t.q}</p>
              {t.a ? (
                <div className="mr-4 rounded-lg bg-gray-50 px-2.5 py-2 text-xs leading-relaxed">
                  <p className="font-medium text-gray-800">{t.a.oneLiner}</p>
                  {t.a.explanation.length > 0 && (
                    <ul className="mt-1 space-y-0.5 text-gray-600">
                      {t.a.explanation.map((x, j) => (
                        <li key={j}>· {x}</li>
                      ))}
                    </ul>
                  )}
                  {(t.refs ?? []).length > 0 && (
                    <p className="mt-1 text-[11px] text-gray-500">
                      引用:
                      {t.refs!.map((r) =>
                        r.url ? (
                          <a key={r.id} href={r.url} target="_blank" rel="noopener noreferrer" className="mr-1.5 text-brand-600 hover:underline">
                            {r.name} ↗
                          </a>
                        ) : (
                          <span key={r.id} className="mr-1.5">{r.name}</span>
                        )
                      )}
                    </p>
                  )}
                  {t.a.result === "no_evidence" && (
                    <p className="mt-1 rounded bg-amber-50 px-1.5 py-0.5 text-[11px] text-amber-700">
                      当前材料不足以回答这个问题——不编造,建议看引用来源自行核实。
                    </p>
                  )}
                  {t.a.uncertainty && (
                    <p className="mt-1 text-[11px] text-gray-400">不确定性:{t.a.uncertainty}</p>
                  )}
                  {/* 免责:应用层固定追加(§5.3),不依赖模型 */}
                  <p className="mt-1.5 border-t border-gray-200 pt-1 text-[10px] text-gray-400">
                    产业链解释,不构成投资建议;个股为关系分级的说明性示例。
                  </p>
                </div>
              ) : t.error ? (
                <p className="mr-4 rounded-lg bg-rose-50 px-2.5 py-1.5 text-xs text-rose-600">{t.error}</p>
              ) : (
                <p className="mr-4 px-2.5 text-xs text-gray-400">思考中…</p>
              )}
            </div>
          ))}
          {notice && <p className="rounded-lg bg-amber-50 px-2.5 py-1.5 text-xs text-amber-700">{notice}</p>}
        </div>

        <div className="border-t border-gray-100 px-4 py-2.5">
          <div className="flex gap-2">
            <input
              value={input}
              maxLength={300}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && !busy && submit(input)}
              placeholder={busy ? "回答中…" : "围绕这个锚点追问(≤300字)"}
              disabled={busy}
              className="min-w-0 flex-1 rounded-lg border border-gray-200 px-2.5 py-1.5 text-xs focus:border-brand-400 focus:outline-none"
            />
            <button
              onClick={() => submit(input)}
              disabled={busy || input.trim().length < 2}
              className="rounded-lg bg-brand-600 px-3 py-1.5 text-xs font-medium text-white disabled:opacity-40"
            >
              发送
            </button>
          </div>
          <p className="mt-1 text-[10px] text-gray-400">
            {quota ? `今日 ${quota.used}/${quota.limit} 次 · ` : ""}只聊产业链解释与验证条件,不提供买卖建议
          </p>
        </div>
      </div>
    </div>
  );
}
