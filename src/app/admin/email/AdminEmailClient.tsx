"use client";

import { useCallback, useEffect, useState } from "react";

interface AdminUser {
  id: string;
  email: string | null;
  nickname: string | null;
  createdAt: string;
  weixinBound: boolean;
  digestOptOut: boolean;
}

export default function AdminEmailClient() {
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [subject, setSubject] = useState("");
  const [text, setText] = useState("");
  const [msg, setMsg] = useState("");
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setMsg("");
    try {
      const r = await fetch(`/api/admin/users`, { cache: "no-store" });
      const d = await r.json();
      if (d.ok) {
        // 只展示有邮箱的用户(无邮箱发不了)
        setUsers((d.users as AdminUser[]).filter((u) => u.email));
      } else setMsg(`加载失败:${d.error}`);
    } catch (e) {
      setMsg(`加载出错:${String(e)}`);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function send(all: boolean) {
    if (!subject.trim()) {
      setMsg("请先填邮件标题");
      return;
    }
    if (!text.trim()) {
      setMsg("请先填邮件正文");
      return;
    }
    const targets = all ? [] : Array.from(selected);
    if (!all && targets.length === 0) {
      setMsg("请勾选用户,或点「群发全部(未退订)」");
      return;
    }
    setLoading(true);
    setMsg("发送中…");
    try {
      const r = await fetch(`/api/admin/email-push`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          all ? { all: true, subject, text } : { userIds: targets, subject, text }
        ),
      });
      const d = await r.json();
      setMsg(d.ok ? `已发送 ${d.sent}/${d.total}` : `失败:${d.error}`);
    } catch (e) {
      setMsg(`出错:${String(e)}`);
    } finally {
      setLoading(false);
    }
  }

  const optedOut = users.filter((u) => u.digestOptOut).length;
  const sendable = users.length - optedOut;

  return (
    <div className="mx-auto max-w-3xl p-6">
      <h1 className="text-h1 font-semibold text-gray-900">邮件推送管理</h1>

      <div className="mt-3 flex gap-2">
        <button
          onClick={load}
          disabled={loading}
          className="rounded-lg bg-gray-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
        >
          {loading ? "…" : "刷新用户"}
        </button>
      </div>

      {/* 反馈改成固定悬浮 toast:发送按钮在底部,原来反馈在顶部会滚出视野=像"没反应"。
          按结果配色:成功绿/失败红/发送中灰/校验提示琥珀。 */}
      {msg && (
        <div
          className={`fixed bottom-4 left-1/2 z-50 -translate-x-1/2 rounded-lg px-4 py-2 text-sm font-medium text-white shadow-lg ${
            msg.startsWith("已发送")
              ? "bg-emerald-600"
              : msg.startsWith("失败") ||
                msg.startsWith("出错") ||
                msg.includes("加载失败")
              ? "bg-rose-600"
              : msg === "发送中…"
              ? "bg-gray-800"
              : "bg-amber-500"
          }`}
        >
          {msg}
        </div>
      )}

      {/* 总览 */}
      <div className="mt-4 grid grid-cols-2 gap-3">
        <div className="rounded-xl bg-white px-4 py-3 shadow-sm">
          <div className="text-xs text-gray-400">有邮箱用户</div>
          <div className="mt-1 text-display font-semibold tabular-nums text-gray-900">
            {users.length}
          </div>
        </div>
        <div className="rounded-xl bg-white px-4 py-3 shadow-sm">
          <div className="text-xs text-gray-400">已退订每日邮件</div>
          <div className="mt-1 text-display font-semibold tabular-nums text-amber-600">
            {optedOut}
          </div>
        </div>
      </div>

      <div className="mt-5">
        <div className="mb-2 text-sm text-gray-500">
          有邮箱用户 {users.length} 人(勾选后单发/群发;群发只发给未退订的 {sendable} 人)
        </div>
        <div className="divide-y divide-gray-100 rounded-lg border border-gray-200">
          {users.length === 0 && (
            <div className="px-3 py-6 text-center text-sm text-gray-400">暂无数据</div>
          )}
          {users.map((u) => (
            <label
              key={u.id}
              className="flex cursor-pointer items-center gap-3 px-3 py-2.5 hover:bg-gray-50"
            >
              <input
                type="checkbox"
                checked={selected.has(u.id)}
                onChange={() => toggle(u.id)}
              />
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-medium text-gray-800">
                  {u.nickname || u.email}
                </div>
                <div className="truncate font-mono text-xs text-gray-400">{u.email}</div>
              </div>
              <div className="text-right text-xs">
                {u.digestOptOut ? (
                  <span className="text-amber-600">已退订</span>
                ) : (
                  <span className="text-emerald-600">订阅中</span>
                )}
              </div>
            </label>
          ))}
        </div>
      </div>

      <div className="mt-5 space-y-2">
        <input
          value={subject}
          onChange={(e) => setSubject(e.target.value)}
          placeholder="邮件标题…"
          className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
        />
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={6}
          placeholder="邮件正文…(纯文本,换行会保留;底部自动附「取消每日推送」)"
          className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
        />
        <div className="flex gap-2">
          <button
            onClick={() => send(false)}
            disabled={loading}
            className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
          >
            发给选中({selected.size})
          </button>
          <button
            onClick={() => send(true)}
            disabled={loading}
            className="rounded-lg bg-gray-700 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
          >
            群发全部(未退订 {sendable})
          </button>
        </div>
        <p className="text-xs text-gray-400">
          勾选单发会发给你选中的用户(含已退订者,按你选择为准);群发只发给未退订用户。每封邮件底部都带退订入口。
        </p>
      </div>
    </div>
  );
}
