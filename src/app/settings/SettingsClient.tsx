"use client";

import { useEffect, useState } from "react";
import { useConfirm } from "@/components/ConfirmDialog";
import { track } from "@/lib/analytics";
import {
  pushSupported,
  getPushSubscription,
  enablePush,
  disablePush,
} from "@/lib/web-push-client";

/* eslint-disable @next/next/no-img-element */

// 个人设置:推送渠道管理。邮件 + 浏览器通知是稳定主通道(不受微信窗口限制),排在最前。
export function SettingsClient({ email }: { email: string | null }) {
  return (
    <div className="space-y-4">
      <EmailCard hasEmail={!!email} email={email} />
      <BrowserPushCard />
      <RiskCard />
      <IntradayCard />
      <WeixinCard />
      <p className="px-1 text-xs leading-relaxed text-gray-400">
        我们只在你的自选有相关动态时才推送,没动静不打扰。各渠道可分别开关。
        推荐至少开启<b>邮件</b>或<b>浏览器通知</b>——这两条最稳,不会因微信会话过期而收不到。
      </p>
    </div>
  );
}

// ---------------- 浏览器通知(Web Push)----------------
// 状态机:loading / unsupported / ios-install(iOS 未加主屏)/ denied(被拦截)/ on / off
function BrowserPushCard() {
  const [state, setState] = useState<
    "loading" | "unsupported" | "ios-install" | "denied" | "on" | "off"
  >("loading");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    (async () => {
      const ua = navigator.userAgent;
      const isIOS = /iphone|ipad|ipod/i.test(ua);
      const standalone =
        window.matchMedia("(display-mode: standalone)").matches ||
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (navigator as any).standalone === true;
      if (!pushSupported()) {
        // iOS 仅在「添加到主屏幕」后才有 PushManager;否则引导先装到主屏
        setState(isIOS && !standalone ? "ios-install" : "unsupported");
        return;
      }
      if (Notification.permission === "denied") {
        setState("denied");
        return;
      }
      const sub = await getPushSubscription();
      setState(sub ? "on" : "off");
    })().catch(() => setState("unsupported"));
  }, []);

  async function enable() {
    setBusy(true);
    try {
      const r = await enablePush();
      if (r.ok) {
        setState("on");
        track("bind_push", { channel: "webpush" }); // 漏斗:绑推送(开浏览器通知)
      } else if (r.reason === "denied") {
        setState("denied");
      }
    } finally {
      setBusy(false);
    }
  }

  async function disable() {
    setBusy(true);
    try {
      await disablePush();
      setState("off");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card
      title="🔔 浏览器通知"
      desc="盘前简报发布后,直接弹到你的电脑/手机桌面,点开直达「和我相关」。不依赖微信,不受会话窗口限制。"
    >
      {state === "loading" && <span className="text-sm text-gray-400">读取中…</span>}

      {state === "unsupported" && (
        <span className="text-sm text-gray-500">
          当前浏览器不支持桌面通知。建议用 Chrome / Edge,或把本站「安装到桌面」后再开启。
        </span>
      )}

      {state === "ios-install" && (
        <span className="text-sm text-gray-500">
          iPhone / iPad 需先用 <b>Safari</b> 打开 → 分享 → <b>「添加到主屏幕」</b>,
          再从主屏图标打开本页即可开启通知。
        </span>
      )}

      {state === "denied" && (
        <span className="text-sm text-gray-500">
          通知已被浏览器拦截。请在浏览器「网站设置 → 通知」里把本站改为<b>允许</b>,再回来开启。
        </span>
      )}

      {(state === "on" || state === "off") && (
        <div className="flex items-center justify-between">
          <span className="text-sm text-gray-700">
            {state === "on"
              ? "已开启:简报发布后弹桌面通知"
              : "已关闭:不会收到桌面通知"}
          </span>
          <Switch
            checked={state === "on"}
            disabled={busy}
            onChange={(next) => (next ? enable() : disable())}
          />
        </div>
      )}
    </Card>
  );
}

// ---------------- 雷区提醒(解禁/增减持/质押/ST)----------------
function RiskCard() {
  const [enabled, setEnabled] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const r = await fetch("/api/me/risk-pref");
        if (!r.ok) return;
        const d = await r.json();
        setEnabled(!!d.enabled);
      } catch {
        /* ignore */
      }
    })();
  }, []);

  async function toggle(next: boolean) {
    setBusy(true);
    try {
      const r = await fetch("/api/me/risk-pref", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled: next }),
      });
      if (r.ok) setEnabled(next);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card
      title="⚠️ 雷区提醒"
      desc="你的自选有解禁、大股东增减持、高质押、ST 风险等重要事件时,盘前提前提醒(微信优先,否则邮件)。"
    >
      <div className="flex items-center justify-between">
        <span className="text-sm text-gray-700">
          {enabled === null
            ? "读取中…"
            : enabled
            ? "已开启:有雷区事件时盘前提醒"
            : "已关闭:不会再收到雷区提醒"}
        </span>
        <Switch checked={!!enabled} disabled={enabled === null || busy} onChange={toggle} />
      </div>
    </Card>
  );
}

// ---------------- 盘中异动提醒(微信渠道)----------------
function IntradayCard() {
  const [enabled, setEnabled] = useState<boolean | null>(null);
  const [bound, setBound] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const r = await fetch("/api/me/intraday-pref");
        if (!r.ok) return;
        const d = await r.json();
        setEnabled(!!d.enabled);
        setBound(!!d.bound);
      } catch {
        /* ignore */
      }
    })();
  }, []);

  async function toggle(next: boolean) {
    setBusy(true);
    try {
      const r = await fetch("/api/me/intraday-pref", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled: next }),
      });
      if (r.ok) setEnabled(next);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card
      title="⚡ 盘中异动提醒"
      desc="交易时段你的自选个股大涨/大跌(±7%)时推到微信,需先绑定微信。"
    >
      <div className="flex items-center justify-between">
        <span className="text-sm text-gray-700">
          {enabled === null
            ? "读取中…"
            : !bound
            ? "未绑定微信:绑定后该提醒才会生效"
            : enabled
            ? "已开启:盘中异动时推微信(每天最多 3 只)"
            : "已关闭:不会再收到盘中异动提醒"}
        </span>
        <Switch
          checked={!!enabled}
          disabled={!bound || enabled === null || busy}
          onChange={toggle}
        />
      </div>
    </Card>
  );
}

function Card({
  title,
  desc,
  children,
}: {
  title: string;
  desc?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-2xl border border-gray-200 bg-white p-5">
      <div className="mb-3">
        <h2 className="text-base font-semibold text-gray-900">{title}</h2>
        {desc && <p className="mt-1 text-xs text-gray-500">{desc}</p>}
      </div>
      {children}
    </section>
  );
}

// ---------------- 邮件推送 ----------------
function EmailCard({ hasEmail, email }: { hasEmail: boolean; email: string | null }) {
  const [enabled, setEnabled] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const r = await fetch("/api/me/digest-pref");
        if (!r.ok) return;
        const d = await r.json();
        setEnabled(!!d.enabled);
      } catch {
        /* ignore */
      }
    })();
  }, []);

  async function toggle(next: boolean) {
    setBusy(true);
    try {
      const r = await fetch("/api/me/digest-pref", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled: next }),
      });
      if (r.ok) {
        setEnabled(next);
        if (next) track("bind_push", { channel: "email" }); // 漏斗:绑推送(开邮件)
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card
      title="📧 邮件推送"
      desc={
        hasEmail
          ? `交易日盘前,只在你的自选有相关动态时发到 ${email}(没动静不打扰),最稳的一条通道。`
          : "你的账号没有邮箱,无法接收邮件推送"
      }
    >
      <div className="flex items-center justify-between">
        <span className="text-sm text-gray-700">
          {enabled === null
            ? "读取中…"
            : enabled
            ? "已开启:交易日盘前有动态时发邮件"
            : "已关闭:不会再收到盘前邮件"}
        </span>
        <Switch
          checked={!!enabled}
          disabled={!hasEmail || enabled === null || busy}
          onChange={toggle}
        />
      </div>
    </Card>
  );
}

// ---------------- 微信推送 ----------------
function WeixinCard() {
  const confirm = useConfirm();
  const [bound, setBound] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [qrImg, setQrImg] = useState<string | null>(null);
  const [qrcode, setQrcode] = useState<string | null>(null);
  const [bindState, setBindState] = useState<
    "pending" | "scanned" | "activated" | "expired" | null
  >(null);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/push/weixin-token");
        if (!res.ok) return;
        const data = await res.json();
        setBound(!!data.bound);
      } catch {
        /* ignore */
      }
    })();
  }, []);

  async function loadQr() {
    setBusy(true);
    try {
      const res = await fetch("/api/push/weixin-qr");
      const data = await res.json();
      if (data.bound) {
        setBound(true);
        return;
      }
      if (data.qrImg) {
        setQrImg(data.qrImg);
        setQrcode(data.qrcode);
        setBindState("pending");
      }
    } finally {
      setBusy(false);
    }
  }

  async function openModal() {
    setShowModal(true);
    if (bound || qrcode) return;
    await loadQr();
  }

  function closeModal() {
    setShowModal(false);
    if (!bound) {
      setQrcode(null);
      setQrImg(null);
      setBindState(null);
    }
  }

  // 轮询绑定状态:pending → scanned(待发消息)→ activated;过期自动换码
  useEffect(() => {
    if (!showModal || !qrcode || bound) return;
    if (bindState === "activated") return;
    let cancelled = false;
    const timer = setInterval(async () => {
      try {
        const res = await fetch(
          `/api/push/weixin-qr-status?qrcode=${encodeURIComponent(qrcode)}`
        );
        const data = await res.json();
        if (cancelled) return;
        if (data.state === "expired") {
          setQrcode(null);
          setQrImg(null);
          await loadQr();
        } else if (data.state === "activated") {
          setBindState("activated");
          setBound(true);
          track("bind_push", { channel: "weixin" }); // 漏斗:绑推送
        } else {
          setBindState(data.state);
        }
      } catch {
        /* ignore */
      }
    }, 2500);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [showModal, qrcode, bindState, bound]);

  async function unbind() {
    const ok = await confirm({
      title: "取消微信推送",
      message: "取消后将不再收到盘前早报和相关动态提醒,确定要取消吗?",
      confirmText: "确定取消",
      danger: true,
    });
    if (!ok) return;
    setBusy(true);
    try {
      const res = await fetch("/api/push/unbind-weixin", { method: "DELETE" });
      if (res.ok) {
        setBound(false);
        setQrcode(null);
        setQrImg(null);
        setBindState(null);
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card
      title="💬 微信推送"
      desc="绑定后,盘前有动态时直接推到你的微信(ClawBot)"
    >
      <div className="flex items-center justify-between">
        <span className="text-sm text-gray-700">
          {bound === null
            ? "读取中…"
            : bound
            ? "已绑定:有动态时推到微信"
            : "未绑定"}
        </span>
        {bound ? (
          <button
            onClick={unbind}
            disabled={busy}
            className="rounded-lg border border-gray-300 px-3 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-100 disabled:opacity-60"
          >
            取消绑定
          </button>
        ) : (
          <button
            onClick={openModal}
            disabled={busy || bound === null}
            className="rounded-lg bg-green-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-green-700 disabled:opacity-60"
          >
            {busy ? "加载中…" : "扫码绑定"}
          </button>
        )}
      </div>
      {bound && (
        <p className="mt-3 rounded-lg bg-gray-50 px-3 py-2 text-xs text-gray-500">
          记得每天打开 ClawBot 发条消息保持接收(微信限制 24 小时窗口)。
        </p>
      )}

      {showModal && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 px-4"
          onClick={closeModal}
        >
          <div
            className="w-full max-w-sm rounded-2xl bg-white p-5 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between">
              <h3 className="text-base font-semibold text-gray-900">
                开启微信每日推送
              </h3>
              <button
                onClick={closeModal}
                className="text-gray-400 hover:text-gray-600"
                aria-label="关闭"
              >
                ✕
              </button>
            </div>

            {bindState === "activated" ? (
              <div className="mt-6 text-center">
                <div className="text-3xl">🎉</div>
                <p className="mt-2 text-sm font-medium text-gray-800">绑定成功!</p>
                <p className="mt-1 text-xs text-gray-500">
                  以后每天早上有动静就会推到你微信。
                </p>
              </div>
            ) : (
              <div className="mt-4 space-y-4 text-sm text-gray-700">
                <div>
                  <div className="font-medium text-gray-800">
                    第一步:用微信「扫一扫」扫码
                  </div>
                  <div className="mt-2 flex justify-center">
                    {qrImg ? (
                      <img
                        src={`https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(qrImg)}`}
                        alt="绑定二维码"
                        className="h-48 w-48 rounded-lg bg-white object-contain shadow-sm"
                      />
                    ) : (
                      <div className="flex h-48 w-48 items-center justify-center rounded-lg border border-dashed border-gray-300 text-xs text-gray-400">
                        {busy ? "二维码加载中…" : "二维码加载失败,请重开"}
                      </div>
                    )}
                  </div>
                  <div className="mt-1 text-center text-xs text-gray-400">
                    二维码会自动刷新,无需担心过期
                  </div>
                </div>

                <div>
                  <div className="font-medium text-gray-800">
                    第二步:在打开的 ClawBot 里
                    <span className="text-emerald-600">发任意一句话</span>激活
                  </div>
                  <div className="mt-1 text-xs text-gray-500">
                    (微信限制:需你主动发一条消息,推送才能进得来)
                  </div>
                </div>

                <div className="rounded-lg bg-gray-50 px-3 py-2 text-center text-xs">
                  {bindState === "scanned" ? (
                    <span className="font-medium text-emerald-600">
                      ✓ 已扫码!请在 ClawBot 发一句话激活…
                    </span>
                  ) : (
                    <span className="text-gray-500">等待扫码…</span>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </Card>
  );
}

// 通用开关
function Switch({
  checked,
  disabled,
  onChange,
}: {
  checked: boolean;
  disabled?: boolean;
  onChange: (next: boolean) => void;
}) {
  return (
    <button
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors disabled:opacity-50 ${
        checked ? "bg-emerald-600" : "bg-gray-300"
      }`}
    >
      <span
        className={`inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform ${
          checked ? "translate-x-5" : "translate-x-0.5"
        }`}
      />
    </button>
  );
}
