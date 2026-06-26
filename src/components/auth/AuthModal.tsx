"use client";

import { useState } from "react";
import { signIn } from "next-auth/react";
import { useRouter } from "next/navigation";

const GOOGLE_ENABLED = process.env.NEXT_PUBLIC_GOOGLE_AUTH === "1";

export function AuthModal({
  isOpen,
  onClose,
}: {
  isOpen: boolean;
  onClose: () => void;
}) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPwd, setShowPwd] = useState(false);
  const [agreed, setAgreed] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  if (!isOpen) return null;

  async function handleEmail(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return setError("请输入有效的邮箱地址");
    if (password.length < 8) return setError("密码至少8个字符");
    if (!agreed) return setError("请确认您已年满 18 岁并同意服务条款和隐私政策");

    setLoading(true);
    try {
      const check = await (
        await fetch("/api/auth/check-email", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email }),
        })
      ).json();

      if (!check.exists) {
        const reg = await fetch("/api/auth/register", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email, password }),
        });
        if (!reg.ok) {
          const d = await reg.json();
          setError(d.error || "注册失败");
          setLoading(false);
          return;
        }
      }
      const res = await signIn("credentials", { redirect: false, email, password });
      if (res?.error) {
        setError(res.error);
        setLoading(false);
        return;
      }
      onClose();
      router.refresh();
    } catch {
      setError("网络异常,请稍后重试");
      setLoading(false);
    }
  }

  async function handleGoogle() {
    if (!agreed) return setError("请先阅读并同意服务条款和隐私政策");
    if (!GOOGLE_ENABLED) return setError("Google 登录即将开启,请先用邮箱");
    await signIn("google", { callbackUrl: "/" });
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-sm rounded-2xl bg-[#F4F1EA] p-7 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          onClick={onClose}
          className="absolute right-4 top-4 text-gray-400 hover:text-gray-700"
          aria-label="关闭"
        >
          ✕
        </button>

        <h2 className="text-center text-2xl font-bold text-[#1C1A16]">登录 / 注册</h2>
        <p className="mt-1 text-center text-sm text-gray-500">
          登录或创建账号以继续使用
        </p>

        <button
          onClick={handleGoogle}
          disabled={!GOOGLE_ENABLED}
          className="mt-5 flex w-full items-center justify-center gap-3 rounded-lg border border-[#E5E2DD] bg-white py-3 text-sm font-medium text-[#1C1A16] hover:bg-[#FAF9F6] disabled:opacity-60"
        >
          <svg className="h-5 w-5" viewBox="0 0 24 24">
            <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.27-4.74 3.27-8.1z" />
            <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84A11 11 0 0 0 12 23z" />
            <path fill="#FBBC05" d="M5.84 14.1a6.6 6.6 0 0 1 0-4.2V7.06H2.18a11 11 0 0 0 0 9.88l3.66-2.84z" />
            <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84C6.71 7.31 9.14 5.38 12 5.38z" />
          </svg>
          {GOOGLE_ENABLED ? "使用 Google 登录" : "Google 登录(即将开启)"}
        </button>

        <div className="my-5 flex items-center gap-3 text-xs text-gray-400">
          <span className="h-px flex-1 bg-gray-300" />
          或使用邮箱登录
          <span className="h-px flex-1 bg-gray-300" />
        </div>

        <form onSubmit={handleEmail} className="space-y-4">
          <div>
            <label className="mb-1 block text-sm font-medium text-[#1C1A16]">邮箱</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="example@example.com"
              className="w-full rounded-lg border border-[#E5E2DD] bg-white px-3 py-2.5 text-sm outline-none focus:border-[#C2703D]"
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-[#1C1A16]">密码</label>
            <div className="relative">
              <input
                type={showPwd ? "text" : "password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="至少8个字符"
                className="w-full rounded-lg border border-[#E5E2DD] bg-white px-3 py-2.5 pr-10 text-sm outline-none focus:border-[#C2703D]"
              />
              <button
                type="button"
                onClick={() => setShowPwd((v) => !v)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400"
                aria-label="显示密码"
              >
                {showPwd ? "🙈" : "👁"}
              </button>
            </div>
          </div>

          <label className="flex items-start gap-2 text-xs text-gray-600">
            <input
              type="checkbox"
              checked={agreed}
              onChange={(e) => setAgreed(e.target.checked)}
              className="mt-0.5"
            />
            <span>
              我已年满 18 岁,并已阅读并同意
              <span className="underline">服务条款</span> 和
              <span className="underline">隐私政策</span>
            </span>
          </label>

          {error && <p className="text-xs text-rose-600">{error}</p>}

          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-lg bg-[#C2703D] py-3 text-sm font-semibold text-white hover:bg-[#a85f31] disabled:opacity-60"
          >
            {loading ? "处理中…" : "免费开始 / 登录"}
          </button>
        </form>
      </div>
    </div>
  );
}
