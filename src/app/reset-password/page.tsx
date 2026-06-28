"use client";

import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";

export const dynamic = "force-dynamic";

function ResetForm() {
  const params = useSearchParams();
  const token = params.get("token") ?? "";
  const [checking, setChecking] = useState(true);
  const [valid, setValid] = useState(false);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);

  useEffect(() => {
    if (!token) {
      setChecking(false);
      return;
    }
    fetch(`/api/auth/reset-password?token=${encodeURIComponent(token)}`)
      .then((r) => r.json())
      .then((d) => setValid(!!d.valid))
      .catch(() => setValid(false))
      .finally(() => setChecking(false));
  }, [token]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (password.length < 8) return setError("密码至少8个字符");
    if (password !== confirm) return setError("两次输入的密码不一致");
    setLoading(true);
    try {
      const res = await fetch("/api/auth/reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, password, confirmPassword: confirm }),
      });
      const d = await res.json();
      if (!res.ok) {
        setError(d.message || "重置失败");
        setLoading(false);
        return;
      }
      setDone(true);
    } catch {
      setError("网络异常,请稍后重试");
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-canvas p-4">
      <div className="w-full max-w-sm rounded-2xl bg-white p-7 shadow-sm">
        <Link href="/" className="text-lg font-bold tracking-tight">
          StockTell
        </Link>
        <h1 className="mt-4 text-xl font-semibold">重置密码</h1>

        {checking ? (
          <p className="mt-4 text-sm text-gray-500">校验链接中…</p>
        ) : !token || !valid ? (
          <div className="mt-4">
            <p className="text-sm text-rose-600">重置链接无效或已过期,请重新申请。</p>
            <Link href="/" className="mt-4 inline-block text-sm text-brand-600 hover:underline">
              返回首页
            </Link>
          </div>
        ) : done ? (
          <div className="mt-4">
            <p className="text-sm text-emerald-600">密码已重置成功,请用新密码登录。</p>
            <Link href="/" className="mt-4 inline-block text-sm text-brand-600 hover:underline">
              返回首页登录
            </Link>
          </div>
        ) : (
          <form onSubmit={submit} className="mt-4 space-y-4">
            <div>
              <label className="mb-1 block text-sm font-medium">新密码</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="至少8个字符"
                className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm outline-none focus:border-gray-900"
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium">确认新密码</label>
              <input
                type="password"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                placeholder="再次输入新密码"
                className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm outline-none focus:border-gray-900"
              />
            </div>
            {error && <p className="text-xs text-rose-600">{error}</p>}
            <button
              type="submit"
              disabled={loading}
              className="w-full rounded-lg bg-gray-900 py-2.5 text-sm font-semibold text-white hover:bg-gray-700 disabled:opacity-60"
            >
              {loading ? "提交中…" : "重置密码"}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}

export default function ResetPasswordPage() {
  return (
    <Suspense fallback={null}>
      <ResetForm />
    </Suspense>
  );
}
