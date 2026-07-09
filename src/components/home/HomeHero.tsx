"use client";

// 首屏 Hero(2026-07-09 视觉重构上生产,对齐稿负责人拍板):深邃暗部 + 汇聚光流——
// canvas 粒子从四周汇向自发光的「今日总判断」核心(光流隐喻多跳传导汇聚成判断),
// 底部渐变回浅色内容区(暗部深邃、亮部通透)。动效尊重 prefers-reduced-motion。
// 埋点与 CTA 三态逻辑(拍板⑩)原样保留:主 CTA 滚 #mine,次 CTA 直达 insight。
// 去重决策(对齐稿第 3 点):总判断只在这里出现;主卡四行放结构拆解,不再重复整段。
import Link from "next/link";
import { useEffect, useRef } from "react";
import { useSession } from "next-auth/react";
import { FeedbackLink } from "@/components/FeedbackLink";
import { useWatchlist } from "@/components/useWatchlist";
import { track } from "@/lib/analytics";

export interface HeroMetrics {
  events: number;
  triggeredChains: number;
  totalChains: number;
  pending: number;
}

// 汇聚光流:轻量 canvas 粒子,青/蓝紫双色,向核心插值收敛
function FlowCanvas() {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const cv = ref.current;
    if (!cv) return;
    const ctx = cv.getContext("2d");
    if (!ctx) return;
    let W = 0, H = 0, CX = 0, CY = 0, raf = 0;
    const dpr = window.devicePixelRatio || 1;
    const size = () => {
      W = cv.width = cv.offsetWidth * dpr;
      H = cv.height = cv.offsetHeight * dpr;
      CX = W / 2;
      CY = H * 0.62;
    };
    size();
    window.addEventListener("resize", size);
    type P = { x: number; y: number; life: number; max: number; hue: number; sp: number };
    const spawn = (p: P) => {
      if (Math.random() < 0.5) { p.x = Math.random() * W; p.y = Math.random() < 0.5 ? -20 : H + 20; }
      else { p.x = Math.random() < 0.5 ? -20 : W + 20; p.y = Math.random() * H; }
      p.life = 0;
      p.max = 240 + Math.random() * 240;
      p.hue = Math.random() < 0.3 ? 190 : 252 + Math.random() * 20;
      p.sp = 0.0022 + Math.random() * 0.0028;
    };
    const parts: P[] = Array.from({ length: 80 }, () => {
      const p = { x: 0, y: 0, life: 0, max: 1, hue: 0, sp: 0 };
      spawn(p);
      p.life = Math.random() * p.max;
      return p;
    });
    const tick = () => {
      ctx.clearRect(0, 0, W, H);
      for (const p of parts) {
        p.life++;
        if (p.life > p.max) { spawn(p); continue; }
        const t = p.sp * (1 + p.life / p.max);
        p.x += (CX - p.x) * t;
        p.y += (CY - p.y) * t;
        const d = Math.hypot(CX - p.x, CY - p.y);
        const a = Math.min(0.5, 0.06 + (1 - d / (W * 0.6)) * 0.5) * (1 - (p.life / p.max) * 0.4);
        const r = Math.max(0.6, 2.4 * dpr * (1 - d / (W * 0.7)));
        ctx.beginPath();
        ctx.arc(p.x, p.y, r, 0, 6.283);
        ctx.fillStyle = `hsla(${p.hue},90%,72%,${a})`;
        ctx.shadowColor = `hsla(${p.hue},95%,65%,.8)`;
        ctx.shadowBlur = 14 * dpr * (1 - d / (W * 0.8));
        ctx.fill();
        ctx.shadowBlur = 0;
      }
      raf = requestAnimationFrame(tick);
    };
    tick();
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", size);
    };
  }, []);
  return <canvas ref={ref} className="absolute inset-0 h-full w-full opacity-90" aria-hidden />;
}

export function HomeHero({
  shownDate,
  insightHref,
  judgment,
  metrics,
}: {
  shownDate: string;
  insightHref: string | null;
  judgment: string | null;
  metrics: HeroMetrics;
}) {
  const { status } = useSession();
  const wl = useWatchlist();
  const viewed = useRef(false);

  const userStatus = status === "authenticated" ? "logged_in" : "guest";
  const hasWatchlist = wl.codes.size > 0;

  useEffect(() => {
    if (viewed.current || status === "loading" || !wl.ready) return;
    viewed.current = true;
    track("home_view", {
      date: shownDate,
      user_status: userStatus,
      has_watchlist: hasWatchlist,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status, wl.ready]);

  const goMine = () => {
    track("home_cta_add_watchlist_click", {
      source_module: "hero",
      user_status: userStatus,
      has_watchlist: hasWatchlist,
    });
    document.getElementById("mine")?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  return (
    <section
      className="relative overflow-hidden px-4 text-[#eef0ff] sm:px-6"
      style={{
        background:
          "radial-gradient(1200px 480px at 50% -10%, #1d2350 0%, transparent 60%), linear-gradient(180deg,#0b0e1a 0%,#12162b 74%,#f7f8fb 100%)",
      }}
    >
      <FlowCanvas />
      {/* 底部渐变收口到浅色内容区 */}
      <div className="pointer-events-none absolute inset-x-0 bottom-0 z-[1] h-32 bg-gradient-to-b from-transparent to-canvas" />

      <div className="relative z-[2] mx-auto max-w-3xl pb-20 pt-10 sm:pt-12">
        <div className="flex items-center justify-center gap-2.5">
          <h1
            className="text-center text-[26px] font-bold tracking-tight sm:text-[32px]"
            style={{ textShadow: "0 0 34px rgba(139,92,246,.45)" }}
          >
            <span className="bg-gradient-to-r from-[#c9d2ff] via-white to-[#b9a6ff] bg-clip-text text-transparent">
              今日产业链推理
            </span>
          </h1>
          <FeedbackLink />
        </div>
        <p className="mt-2 text-center text-xs tracking-wide text-[#8f96c0]">
          {shownDate} · 基于隔夜海外事件、产业链关系库与人工审阅生成
        </p>

        {/* 自发光核心:今日总判断 */}
        <div
          className="mx-auto mt-8 max-w-2xl rounded-2xl p-px"
          style={{
            background:
              "linear-gradient(135deg,rgba(34,211,238,.55),rgba(139,92,246,.65) 45%,rgba(79,70,229,.35))",
            boxShadow:
              "0 0 60px -8px rgba(120,90,255,.55), 0 0 140px -20px rgba(34,211,238,.25), 0 30px 60px -30px rgba(0,0,0,.7)",
          }}
        >
          <div
            className="rounded-[15px] px-5 py-5 sm:px-6"
            style={{ background: "linear-gradient(180deg,rgba(22,26,52,.92),rgba(14,17,36,.96))" }}
          >
            <span className="inline-flex items-center gap-2 text-[11px] uppercase tracking-[.18em] text-[#b9c1ff]">
              <span className="h-1.5 w-1.5 rounded-full bg-cyan-400 shadow-[0_0_12px_#22d3ee]" />
              今日主线
            </span>
            {judgment ? (
              <p className="mt-2.5 text-[15px] font-medium leading-relaxed text-[#f2f3ff] sm:text-base">
                {judgment}
              </p>
            ) : (
              <p className="mt-2.5 text-sm leading-relaxed text-[#8f96c0]">
                今日判断生成中(每个交易日约 07:00 更新),先看下方各链传导结构。
              </p>
            )}
            <div className="mt-4 flex flex-wrap gap-x-8 gap-y-2 border-t border-[#8c96dc]/20 pt-4">
              {[
                ["今日事件", `${metrics.events}`, "条"],
                ["触发链", `${metrics.triggeredChains}`, `/${metrics.totalChains} 条`],
                ["待验证关系", `${metrics.pending}`, "条"],
              ].map(([k, v, unit]) => (
                <div key={k}>
                  <span className="block text-[11px] tracking-wider text-[#8f96c0]">{k}</span>
                  <span className="text-xl font-bold tabular-nums text-white">
                    {v}
                    <i className="ml-0.5 text-xs font-medium not-italic text-[#9aa3d8]">{unit}</i>
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="mt-6 flex flex-wrap justify-center gap-3">
          <button
            onClick={goMine}
            className="inline-flex min-h-[42px] items-center gap-1 rounded-xl bg-gradient-to-br from-brand-600 to-[#8b5cf6] px-5 py-2.5 text-sm font-semibold text-white shadow-[0_8px_28px_-8px_rgba(124,90,255,.7)] transition-all hover:-translate-y-px hover:shadow-[0_12px_34px_-8px_rgba(124,90,255,.85)]"
          >
            ⭐ 添加自选,查看和我相关
          </button>
          {insightHref && (
            <Link
              href={insightHref}
              onClick={() =>
                track("home_cta_view_insight_click", {
                  source_module: "hero",
                  user_status: userStatus,
                  has_watchlist: hasWatchlist,
                })
              }
              className="inline-flex min-h-[42px] items-center gap-1 rounded-xl border border-[#8c96e6]/30 bg-[#8c96e6]/10 px-5 py-2.5 text-sm font-medium text-[#ccd2ff] transition-colors hover:bg-[#8c96e6]/20"
            >
              查看今日完整因果链 →
            </Link>
          )}
        </div>
      </div>
    </section>
  );
}
