"use client";

// OAuth 登录/注册补埋:Google 走整页跳转,回来后无法像邮箱那样内联埋点。
// handleGoogle 把 callbackUrl 设成 /?auth=google;这里在登录态下读到该标记,
// 向 /api/me/created 问"是否刚注册",据此 fire signup / login(method=来源),再 strip 掉参数(不刷新)。
// 只在带标记的那一次 OAuth 回跳时触发,普通页面加载不会误报。
import { useEffect, useRef } from "react";
import { useSession } from "next-auth/react";
import { track } from "@/lib/analytics";

export function AuthTracker() {
  const { status } = useSession();
  const done = useRef(false);

  useEffect(() => {
    if (done.current || status !== "authenticated") return;
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    const method = params.get("auth"); // 目前只有 "google"
    if (!method) return;
    done.current = true;

    // 先把标记从 URL 去掉(软替换,不触发导航/刷新),避免刷新时重复计
    params.delete("auth");
    const qs = params.toString();
    window.history.replaceState(
      {},
      "",
      window.location.pathname + (qs ? `?${qs}` : "") + window.location.hash
    );

    fetch("/api/me/created", { cache: "no-store" })
      .then((r) => r.json())
      .then((d) => track(d?.isNew ? "signup" : "login", { method }))
      .catch(() => track("login", { method })); // 取不到 createdAt 也至少记一次 login
  }, [status]);

  return null;
}
