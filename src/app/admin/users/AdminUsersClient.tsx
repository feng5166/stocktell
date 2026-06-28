"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

interface Row {
  id: string;
  email: string | null;
  nickname: string | null;
  createdAt: string;
  weixinBound: boolean;
  openId: string | null;
}

function fmtDate(s: string): string {
  try {
    return new Date(s).toLocaleString("zh-CN", {
      timeZone: "Asia/Shanghai",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return s;
  }
}

export default function AdminUsersClient({ adminEmail }: { adminEmail: string }) {
  const [rows, setRows] = useState<Row[]>([]);
  const [total, setTotal] = useState(0);
  const [bound, setBound] = useState(0);
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState("");
  const [onlyBound, setOnlyBound] = useState(false);
  const [q, setQ] = useState("");
  const [sendTo, setSendTo] = useState<Row | null>(null);
  const [sendText, setSendText] = useState("");
  const [sending, setSending] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setMsg("");
    try {
      const r = await fetch("/api/admin/users", { cache: "no-store" });
      const d = await r.json();
      if (d.ok) {
        setRows(d.users);
        setTotal(d.total);
        setBound(d.bound);
      } else {
        setMsg(`加载失败:${d.error}`);
      }
    } catch (e) {
      setMsg(`出错:${String(e)}`);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function doSend() {
    if (!sendTo || !sendText.trim()) return;
    setSending(true);
    try {
      const r = await fetch("/api/admin/weixin-push", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ openIds: [sendTo.openId], text: sendText }),
      });
      const d = await r.json();
      setMsg(
        d.ok
          ? `已发给 ${sendTo.nickname || sendTo.email || "该用户"}:${d.sent}/${d.total}`
          : `失败:${d.error}`
      );
      if (d.ok && d.sent > 0) {
        setSendTo(null);
        setSendText("");
      }
    } catch (e) {
      setMsg(`出错:${String(e)}`);
    } finally {
      setSending(false);
    }
  }

  const filtered = rows.filter((u) => {
    if (onlyBound && !u.weixinBound) return false;
    if (!q) return true;
    const s = q.toLowerCase();
    return (
      (u.email || "").toLowerCase().includes(s) ||
      (u.nickname || "").toLowerCase().includes(s) ||
      (u.openId || "").toLowerCase().includes(s)
    );
  });

  return (
    <div className="mx-auto max-w-3xl p-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold text-gray-900">网站用户</h1>
        <div className="flex items-center gap-3 text-xs">
          <Link href="/admin/push" className="text-blue-600 hover:underline">
            微信推送管理 →
          </Link>
          <span className="text-gray-400">{adminEmail}</span>
        </div>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-3 text-sm">
        <span className="rounded-lg bg-gray-100 px-3 py-1.5">
          共 <b>{total}</b> 人 · 已绑微信 <b className="text-emerald-600">{bound}</b> 人
        </span>
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="搜邮箱 / 昵称 / openId"
          className="flex-1 rounded-lg border border-gray-300 px-3 py-1.5 text-sm"
        />
        <label className="flex items-center gap-1.5 text-xs text-gray-600">
          <input
            type="checkbox"
            checked={onlyBound}
            onChange={(e) => setOnlyBound(e.target.checked)}
          />
          只看已绑微信
        </label>
        <button
          onClick={load}
          disabled={loading}
          className="rounded-lg bg-gray-900 px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50"
        >
          {loading ? "…" : "刷新"}
        </button>
      </div>

      {msg && <div className="mt-3 rounded-lg bg-blue-50 px-3 py-2 text-sm text-blue-700">{msg}</div>}

      <div className="mt-4 overflow-hidden rounded-lg border border-gray-200">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-left text-xs text-gray-500">
            <tr>
              <th className="px-3 py-2 font-medium">用户</th>
              <th className="px-3 py-2 font-medium">注册时间</th>
              <th className="px-3 py-2 font-medium">微信</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {filtered.length === 0 && (
              <tr>
                <td colSpan={3} className="px-3 py-6 text-center text-gray-400">
                  {loading ? "加载中…" : "无数据"}
                </td>
              </tr>
            )}
            {filtered.map((u) => (
              <tr key={u.id} className="hover:bg-gray-50">
                <td className="px-3 py-2.5">
                  <div className="font-medium text-gray-800">
                    {u.nickname || u.email || u.id}
                  </div>
                  {u.email && u.nickname && (
                    <div className="text-xs text-gray-400">{u.email}</div>
                  )}
                </td>
                <td className="px-3 py-2.5 text-xs text-gray-500">{fmtDate(u.createdAt)}</td>
                <td className="px-3 py-2.5">
                  {u.weixinBound ? (
                    <div className="flex items-center gap-2">
                      <span
                        className="text-xs font-medium text-emerald-600"
                        title={u.openId || ""}
                      >
                        ✓ 已绑
                      </span>
                      <button
                        onClick={() => {
                          setSendTo(u);
                          setSendText("");
                        }}
                        className="rounded bg-emerald-600 px-2 py-0.5 text-xs text-white hover:bg-emerald-700"
                      >
                        发推送
                      </button>
                    </div>
                  ) : (
                    <span className="text-xs text-gray-300">—</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {sendTo && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 px-4"
          onClick={() => setSendTo(null)}
        >
          <div
            className="w-full max-w-md rounded-2xl bg-white p-5 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between">
              <h3 className="text-sm font-semibold text-gray-900">
                发微信推送 · {sendTo.nickname || sendTo.email || sendTo.id}
              </h3>
              <button
                onClick={() => setSendTo(null)}
                className="text-gray-400 hover:text-gray-600"
                aria-label="关闭"
              >
                ✕
              </button>
            </div>
            <textarea
              value={sendText}
              onChange={(e) => setSendText(e.target.value)}
              rows={5}
              autoFocus
              placeholder="推送内容…(注意:用户需在过去 24h 内发过消息才收得到)"
              className="mt-3 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
            />
            <div className="mt-3 flex justify-end gap-2">
              <button
                onClick={() => setSendTo(null)}
                className="rounded-lg px-4 py-2 text-sm text-gray-500 hover:bg-gray-100"
              >
                取消
              </button>
              <button
                onClick={doSend}
                disabled={sending || !sendText.trim()}
                className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-50"
              >
                {sending ? "发送中…" : "发送"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
