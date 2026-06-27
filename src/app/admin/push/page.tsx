"use client";

import { useCallback, useEffect, useState } from "react";

interface WxUser {
  id: string;
  email: string | null;
  nickname: string | null;
  openId: string;
  createdAt: string;
  active: boolean | null;
  windowSec: number | null;
  inWindow: boolean | null;
}

function fmtWindow(sec: number | null): string {
  if (sec == null) return "未激活";
  if (sec < 60) return `${sec}秒前`;
  if (sec < 3600) return `${Math.floor(sec / 60)}分钟前`;
  if (sec < 86400) return `${Math.floor(sec / 3600)}小时前`;
  return `${Math.floor(sec / 86400)}天前(超窗)`;
}

export default function AdminPush() {
  const [token, setToken] = useState("");
  const [users, setUsers] = useState<WxUser[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [text, setText] = useState("");
  const [msg, setMsg] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const t = localStorage.getItem("admin_token");
    if (t) setToken(t);
  }, []);

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    setMsg("");
    try {
      const r = await fetch(`/api/admin/weixin-users?token=${encodeURIComponent(token)}`, { cache: "no-store" });
      const d = await r.json();
      if (d.ok) {
        setUsers(d.users);
        localStorage.setItem("admin_token", token);
      } else {
        setMsg(`加载失败:${d.error}`);
      }
    } catch (e) {
      setMsg(`加载出错:${String(e)}`);
    } finally {
      setLoading(false);
    }
  }, [token]);

  function toggle(openId: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(openId)) next.delete(openId);
      else next.add(openId);
      return next;
    });
  }

  async function push(all: boolean) {
    if (!text.trim()) {
      setMsg("请先填推送内容");
      return;
    }
    const targets = all ? [] : Array.from(selected);
    if (!all && targets.length === 0) {
      setMsg("请勾选用户,或点「群发全部」");
      return;
    }
    setLoading(true);
    setMsg("推送中…");
    try {
      const r = await fetch(`/api/admin/weixin-push?token=${encodeURIComponent(token)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(all ? { all: true, text } : { openIds: targets, text }),
      });
      const d = await r.json();
      setMsg(d.ok ? `已推送 ${d.sent}/${d.total}` : `失败:${d.error}`);
    } catch (e) {
      setMsg(`出错:${String(e)}`);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="mx-auto max-w-3xl p-6">
      <h1 className="text-xl font-semibold text-gray-900">微信推送管理</h1>

      <div className="mt-4 flex gap-2">
        <input
          type="password"
          value={token}
          onChange={(e) => setToken(e.target.value)}
          placeholder="ADMIN_TOKEN"
          className="flex-1 rounded-lg border border-gray-300 px-3 py-2 text-sm"
        />
        <button
          onClick={load}
          disabled={loading || !token}
          className="rounded-lg bg-gray-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
        >
          {loading ? "…" : "加载用户"}
        </button>
      </div>

      {msg && <div className="mt-3 rounded-lg bg-blue-50 px-3 py-2 text-sm text-blue-700">{msg}</div>}

      <div className="mt-5">
        <div className="mb-2 text-sm text-gray-500">已绑微信用户 {users.length} 人(勾选后可单发/群发)</div>
        <div className="divide-y divide-gray-100 rounded-lg border border-gray-200">
          {users.length === 0 && <div className="px-3 py-6 text-center text-sm text-gray-400">暂无数据</div>}
          {users.map((u) => (
            <label key={u.id} className="flex cursor-pointer items-center gap-3 px-3 py-2.5 hover:bg-gray-50">
              <input
                type="checkbox"
                checked={selected.has(u.openId)}
                onChange={() => toggle(u.openId)}
              />
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-medium text-gray-800">
                  {u.nickname || u.email || u.id}
                </div>
                <div className="truncate font-mono text-xs text-gray-400">{u.openId}</div>
              </div>
              <div className="text-right text-xs">
                <span className={u.inWindow ? "text-emerald-600" : u.inWindow === false ? "text-red-500" : "text-gray-400"}>
                  {u.active === false ? "未激活" : fmtWindow(u.windowSec)}
                </span>
              </div>
            </label>
          ))}
        </div>
      </div>

      <div className="mt-5">
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={5}
          placeholder="推送内容…(注意:用户需在过去 24h 内发过消息才收得到)"
          className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
        />
        <div className="mt-2 flex gap-2">
          <button
            onClick={() => push(false)}
            disabled={loading}
            className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
          >
            发给选中({selected.size})
          </button>
          <button
            onClick={() => push(true)}
            disabled={loading}
            className="rounded-lg bg-gray-700 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
          >
            群发全部
          </button>
        </div>
      </div>
    </div>
  );
}
