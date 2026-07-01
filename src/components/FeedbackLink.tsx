"use client";

// 全站「💬 反馈」入口:点开轻量弹窗,不跳页。问题/建议/其他 + 内容 + 可选联系方式。
// 不需要登录(零门槛);登录用户自动带邮箱。提交 → /api/feedback(飞书通知 + 尽力存库)。
import { useState } from "react";
import { useSession } from "next-auth/react";
import { track } from "@/lib/analytics";
import { useLockBodyScroll } from "@/lib/useLockBodyScroll";

const CATEGORIES = ["问题", "建议", "其他"] as const;
type Category = (typeof CATEGORIES)[number];

export function FeedbackLink({ className }: { className?: string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className={
          className ??
          // 默认:标题旁的醒目小药丸(品牌色)。可传 className 覆盖。
          "inline-flex shrink-0 items-center gap-1 whitespace-nowrap rounded-full bg-brand-50 px-2.5 py-1 text-xs font-medium text-brand-700 ring-1 ring-inset ring-brand-200 transition-colors hover:bg-brand-100"
        }
        aria-label="意见反馈"
      >
        💬 反馈
      </button>
      {open && <FeedbackModal onClose={() => setOpen(false)} />}
    </>
  );
}

function FeedbackModal({ onClose }: { onClose: () => void }) {
  useLockBodyScroll();
  const { data: session } = useSession();
  const [category, setCategory] = useState<Category>("建议");
  const [content, setContent] = useState("");
  const [contact, setContact] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState("");

  const loggedInEmail = session?.user?.email ?? "";

  async function submit() {
    setError("");
    if (content.trim().length < 2) return setError("说点什么呗~");
    setSubmitting(true);
    try {
      const r = await fetch("/api/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          category,
          content: content.trim(),
          contact: contact.trim(),
          path: typeof window !== "undefined" ? window.location.pathname : "",
        }),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok || !d.ok) {
        setError(d.error || "提交失败,稍后再试");
        setSubmitting(false);
        return;
      }
      track("submit_feedback", { category });
      setDone(true);
    } catch {
      setError("网络异常,稍后再试");
      setSubmitting(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-[80] flex items-end justify-center bg-black/40 p-0 sm:items-center sm:p-4"
      onClick={onClose}
    >
      <div
        className="max-h-[90dvh] w-full max-w-md overflow-y-auto overscroll-contain rounded-t-2xl bg-white p-5 pb-[calc(1.25rem+env(safe-area-inset-bottom,0px))] shadow-xl sm:max-h-[85vh] sm:rounded-2xl sm:pb-5"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-1 flex items-center justify-between">
          <h2 className="text-base font-semibold text-gray-900">意见反馈</h2>
          <button
            onClick={onClose}
            className="-m-2 inline-flex h-10 w-10 items-center justify-center rounded-full text-gray-500 hover:bg-gray-100 hover:text-gray-700"
            aria-label="关闭"
          >
            ✕
          </button>
        </div>

        {done ? (
          <div className="py-6 text-center">
            <div className="text-2xl">🙏</div>
            <p className="mt-2 text-sm text-gray-700">
              收到了,谢谢你的反馈!我们会认真看。
            </p>
            <button
              onClick={onClose}
              className="mt-5 w-full rounded-lg bg-brand-600 py-2.5 text-sm font-semibold text-white hover:bg-brand-700"
            >
              好的
            </button>
          </div>
        ) : (
          <>
            <p className="mb-3 text-xs text-gray-400">
              用着哪里不顺、想要什么功能、或者就想吐个槽,都欢迎告诉我们。
            </p>

            <div className="mb-3 flex gap-2">
              {CATEGORIES.map((c) => (
                <button
                  key={c}
                  onClick={() => setCategory(c)}
                  className={`rounded-full px-3 py-1 text-sm transition-colors ${
                    category === c
                      ? "bg-brand-600 font-medium text-white"
                      : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                  }`}
                >
                  {c}
                </button>
              ))}
            </div>

            <textarea
              value={content}
              onChange={(e) => setContent(e.target.value)}
              rows={4}
              maxLength={2000}
              placeholder={
                category === "问题"
                  ? "遇到什么问题?在哪个页面、怎么操作出现的…"
                  : category === "建议"
                  ? "希望我们加点什么 / 改进什么?"
                  : "想说的话…"
              }
              className="w-full resize-none rounded-lg border border-gray-300 bg-white px-3 py-2.5 text-sm outline-none focus:border-brand-500"
            />

            <input
              value={contact}
              onChange={(e) => setContact(e.target.value)}
              placeholder={
                loggedInEmail
                  ? `联系方式(默认用你的邮箱 ${loggedInEmail})`
                  : "联系方式(选填,方便我们回复你)"
              }
              className="mt-2 w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm outline-none focus:border-brand-500"
            />

            {error && <p className="mt-2 text-xs text-rose-600">{error}</p>}

            <button
              onClick={submit}
              disabled={submitting}
              className="mt-4 w-full rounded-lg bg-brand-600 py-2.5 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-60"
            >
              {submitting ? "提交中…" : "提交反馈"}
            </button>
          </>
        )}
      </div>
    </div>
  );
}
