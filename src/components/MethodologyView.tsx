"use client";
// /methodology 入口埋点(PRD prd-trust-chat-pro-intent §7):methodology_view {entry}。
// entry 从 ?from= 读(footer/evidence/relations/direct),client 侧读 location 保持页面 SSG。
// 挂载时报一次;无 from 记 direct。不传 PII。
import { useEffect } from "react";
import { track } from "@/lib/analytics";

// review P2:?from 是任意用户可控字符串,原样上报会污染 Umami 基数/注入垃圾维度——白名单收口
const ALLOWED_ENTRIES = new Set(["footer", "evidence", "relations"]);

export function MethodologyView() {
  useEffect(() => {
    const raw = new URLSearchParams(window.location.search).get("from") ?? "direct";
    track("methodology_view", { entry: ALLOWED_ENTRIES.has(raw) ? raw : "direct" });
  }, []);
  return null;
}
