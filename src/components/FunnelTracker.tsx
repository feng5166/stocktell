"use client";

// 激活漏斗基础埋点(onboarding v2):补齐规划文档点名的两个盲区事件。
// - landing_view:每会话一次(漏斗分母),带 有无自选/来源;
// - returning_visit:首访时间戳存 localStorage,>20h 后的新会话记一次(D1 留存唯一硬指标)。
// 只传非身份信息;失败静默(track 内部已兜)。
import { useEffect } from "react";
import { track } from "@/lib/analytics";

const FIRST_SEEN_KEY = "stocktell_first_seen";
const SESSION_FLAG = "stocktell_landing_tracked";

export function FunnelTracker() {
  useEffect(() => {
    try {
      if (sessionStorage.getItem(SESSION_FLAG)) return;
      sessionStorage.setItem(SESSION_FLAG, "1");
    } catch {
      return; // 隐私模式:宁可少记,不重复刷
    }

    let hasWatchlist = false;
    try {
      const v = JSON.parse(localStorage.getItem("stocktell_watchlist") || "[]");
      hasWatchlist = Array.isArray(v) && v.length > 0;
    } catch {
      /* ignore */
    }

    // 来源:utm_source 优先,其次 referrer 的 host(不含路径,无 PII)
    let source = "direct";
    try {
      const utm = new URLSearchParams(window.location.search).get("utm_source");
      if (utm) source = utm.slice(0, 40);
      else if (document.referrer) {
        const h = new URL(document.referrer).host;
        if (h && h !== window.location.host) source = h;
        else if (h) source = "internal";
      }
    } catch {
      /* ignore */
    }

    track("landing_view", { has_watchlist: hasWatchlist, source });

    try {
      const first = Number(localStorage.getItem(FIRST_SEEN_KEY) || 0);
      const now = Date.now();
      if (!first) {
        localStorage.setItem(FIRST_SEEN_KEY, String(now));
      } else if (now - first > 20 * 3600_000) {
        const days = Math.round((now - first) / 86_400_000);
        track("returning_visit", { days_since_first: days, has_watchlist: hasWatchlist });
      }
    } catch {
      /* ignore */
    }
  }, []);
  return null;
}
