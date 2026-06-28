"use client";

import { useEffect, useState } from "react";
import { signIn } from "next-auth/react";
import { useRouter } from "next/navigation";

const GOOGLE_ENABLED = process.env.NEXT_PUBLIC_GOOGLE_AUTH === "1";
// 本设备上次登录用的邮箱(只记邮箱、不记密码),下次自动回填登录框
const LAST_EMAIL_KEY = "stocktell:last-email";

export function AuthModal({ onClose }: { onClose: () => void }) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPwd, setShowPwd] = useState(false);
  const [agreed, setAgreed] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [showForgot, setShowForgot] = useState(false);

  // 回填本设备上次登录的邮箱(在客户端挂载后读,避免 SSR 水合不一致)
  useEffect(() => {
    try {
      const last = localStorage.getItem(LAST_EMAIL_KEY);
      if (last) setEmail(last);
    } catch {
      /* localStorage 不可用则忽略 */
    }
  }, []);

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
      // 登录成功:只记住邮箱供下次回填,密码绝不存
      try {
        localStorage.setItem(LAST_EMAIL_KEY, email.toLowerCase().trim());
      } catch {
        /* 忽略 */
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
    <>
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

        <h2 className="text-center text-h1 font-bold text-ink">登录 / 注册</h2>
        <p className="mt-1 text-center text-sm text-gray-500">
          登录或创建账号以继续使用
        </p>

        <button
          onClick={handleGoogle}
          disabled={!GOOGLE_ENABLED}
          className="mt-5 flex w-full items-center justify-center gap-3 rounded-lg border border-[#E5E2DD] bg-white py-3 text-sm font-medium text-ink hover:bg-[#FAF9F6] disabled:opacity-60"
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
            <label className="mb-1 block text-sm font-medium text-ink">邮箱</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="example@example.com"
              autoComplete="email"
              className="w-full rounded-lg border border-[#E5E2DD] bg-white px-3 py-2.5 text-sm outline-none focus:border-[#C2703D]"
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-ink">密码</label>
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

          <div className="text-right">
            <button
              type="button"
              onClick={() => setShowForgot(true)}
              className="text-xs text-gray-500 hover:text-gray-800"
            >
              忘记密码?
            </button>
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
              <a
                href="/terms"
                target="_blank"
                rel="noreferrer"
                onClick={(e) => e.stopPropagation()}
                className="text-brand-600 underline"
              >
                服务条款
              </a>{" "}
              和
              <a
                href="/privacy"
                target="_blank"
                rel="noreferrer"
                onClick={(e) => e.stopPropagation()}
                className="text-brand-600 underline"
              >
                隐私政策
              </a>
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
    {showForgot && (
      <ForgotPasswordModal
        defaultEmail={email}
        onClose={() => setShowForgot(false)}
      />
    )}
    </>
  );
}

function ForgotPasswordModal({
  defaultEmail,
  onClose,
}: {
  defaultEmail: string;
  onClose: () => void;
}) {
  const [email, setEmail] = useState(defaultEmail);
  const [sent, setSent] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function submit() {
    setError("");
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return setError("请输入有效的邮箱地址");
    setLoading(true);
    try {
      await fetch("/api/auth/forgot-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      setSent(true);
    } catch {
      setError("发送失败,请稍后重试");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 p-4"
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-sm rounded-2xl bg-white p-6 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          onClick={onClose}
          className="absolute right-4 top-4 text-gray-400 hover:text-gray-700"
          aria-label="关闭"
        >
          ✕
        </button>
        <h2 className="text-h2 font-bold text-gray-900">忘记密码</h2>

        {sent ? (
          <div className="mt-4 text-sm text-gray-700">
            <p>如果该邮箱已注册,重置链接已发送,请查收邮箱(15 分钟内有效)。</p>
            <button
              onClick={onClose}
              className="mt-4 w-full rounded-lg bg-gray-900 py-2.5 text-sm font-medium text-white hover:bg-gray-700"
            >
              知道了
            </button>
          </div>
        ) : (
          <>
            <p className="mt-1 text-sm text-gray-500">
              请输入您的账号邮箱,我们将向您发送重置密码的链接。
            </p>
            <label className="mt-4 block text-sm font-medium text-gray-900">邮箱地址</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="example@example.com"
              className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm outline-none focus:border-gray-900"
            />
            <p className="mt-1 text-xs text-gray-400">我们将向此邮箱发送重置密码的链接</p>
            {error && <p className="mt-2 text-xs text-rose-600">{error}</p>}
            <div className="mt-5 flex justify-end gap-2">
              <button
                onClick={onClose}
                className="rounded-lg border border-gray-300 px-4 py-2 text-sm hover:bg-gray-50"
              >
                取消
              </button>
              <button
                onClick={submit}
                disabled={loading}
                className="rounded-lg bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-700 disabled:opacity-60"
              >
                {loading ? "发送中…" : "发送重置链接"}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
