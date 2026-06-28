"use client";

// 今日简报信息流:把简报按"是否命中我的自选"分成「和我相关」+「其他市场动态」。
// 和我相关一律不锁(先认我,别拿用户自己的票去设墙);免费墙只作用于其他动态。
import Link from "next/link";
import { useEffect, useState } from "react";
import type { BriefingItem } from "@/lib/briefings";
import { AuthButton } from "@/components/auth/AuthButton";
import { useWatchlist } from "@/components/useWatchlist";
import { FundFlow } from "@/components/FundFlow";
import { IMPACT_META } from "@/lib/impact";

const FREE_LIMIT = 3;

export function BriefingFeed({
  items,
  loggedIn,
}: {
  items: BriefingItem[];
  loggedIn: boolean;
}) {
  const wl = useWatchlist();
  const isMine = (it: BriefingItem) =>
    (it.triggerCode != null && wl.has(it.triggerCode)) ||
    it.beneficiaries.some((b) => wl.has(b.code));

  const mine = items.filter(isMine);
  const others = items.filter((it) => !isMine(it));

  // 免费墙只作用于"其他动态"
  let shown = 0;
  const gate = (it: BriefingItem) => {
    const free = loggedIn || it.impact === "高" || shown < FREE_LIMIT;
    if (free) shown++;
    return free;
  };

  return (
    <div className="space-y-7">
      <section>
        <SectionHead
          title="和我相关"
          hint={wl.codes.size ? `按你的 ${wl.codes.size} 只自选筛选` : undefined}
        />
        {!wl.ready ? (
          <Hint>加载你的自选…</Hint>
        ) : wl.codes.size === 0 ? (
          <Hint>
            还没告诉我你拿哪些票。去{" "}
            <Link href="/stocks" className="text-blue-600 hover:underline">
              股票池
            </Link>{" "}
            点 ☆ 加自选,以后这儿只给你看跟你票相关的。
          </Hint>
        ) : (
          <div className="space-y-3">
            {mine.length === 0 ? (
              <>
                <FundFlow codes={wl.codes} />
                <Hint>今天你的自选没有相关动态,安心上班 ☕</Hint>
              </>
            ) : (
              <>
                <MorningBrief codes={wl.codes} items={mine} />
                <FundFlow codes={wl.codes} />
                {mine.map((it) => (
                  <BriefingCard
                    key={it.id}
                    item={it}
                    mine
                    watchedCodes={wl.codes}
                  />
                ))}
              </>
            )}
          </div>
        )}
      </section>

      {others.length > 0 && (
        <section>
          <SectionHead title="其他市场动态" />
          <div className="space-y-3">
            {others.map((it) =>
              gate(it) ? (
                <BriefingCard key={it.id} item={it} watchedCodes={wl.codes} />
              ) : (
                <LockedCard key={it.id} item={it} />
              )
            )}
          </div>
        </section>
      )}
    </div>
  );
}

// 把早报正文里出现的股票名(来自相关条目的触发股/受益股)替换成可点链接 → /stock/[code]。
function linkifyBrief(text: string, items: BriefingItem[]): React.ReactNode[] {
  const nameToCode = new Map<string, string>();
  for (const it of items) {
    if (it.triggerName && it.triggerCode)
      nameToCode.set(it.triggerName, it.triggerCode);
    for (const b of it.beneficiaries) nameToCode.set(b.name, b.code);
  }
  const names = Array.from(nameToCode.keys())
    .filter((n) => n && n.length >= 2)
    .sort((a, b) => b.length - a.length); // 长名优先,避免子串误匹配
  if (names.length === 0) return [text];
  const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const re = new RegExp(`(${names.map(esc).join("|")})`, "g");
  return text.split(re).map((seg, i) => {
    const code = nameToCode.get(seg);
    return code ? (
      <Link
        key={i}
        href={`/stock/${code}`}
        className="font-medium text-amber-800 underline decoration-amber-300 underline-offset-2 hover:text-amber-900"
      >
        {seg}
      </Link>
    ) : (
      <span key={i}>{seg}</span>
    );
  });
}

// 「和我相关」顶部的个性化早报:LLM 综合你今天相关动态写一段人话。
// 把已算好的相关条目 items 一并传给接口,服务端不再重查简报,命中缓存即秒回。
function MorningBrief({ codes, items }: { codes: Set<string>; items: BriefingItem[] }) {
  const [brief, setBrief] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const codeKey = Array.from(codes).sort().join(",");
  useEffect(() => {
    let active = true;
    setLoading(true);
    fetch("/api/morning-brief", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ codes: codeKey ? codeKey.split(",") : [], items }),
    })
      .then((r) => r.json())
      .then((d) => {
        if (active) {
          setBrief(d.brief ?? null);
          setLoading(false);
        }
      })
      .catch(() => active && setLoading(false));
    return () => {
      active = false;
    };
    // items 跟随 codes 变化,用 codeKey 作依赖即可(避免 mine 数组引用每次变导致重复请求)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [codeKey]);

  if (loading)
    return (
      <div className="rounded-xl border border-amber-100 bg-amber-50/50 px-4 py-3 text-sm text-gray-400">
        ☀️ 正在为你生成今日早报…
      </div>
    );
  if (!brief) return null;
  return (
    <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3">
      <div className="mb-1 text-xs font-medium text-amber-700">☀️ 你的今日早报</div>
      <p className="text-sm leading-relaxed text-gray-800">
        {linkifyBrief(brief, items)}
      </p>
    </div>
  );
}

function SectionHead({ title, hint }: { title: string; hint?: string }) {
  return (
    <div className="mb-2 flex items-baseline gap-2">
      <h2 className="text-sm font-semibold text-gray-700">{title}</h2>
      {hint && <span className="text-xs text-gray-400">{hint}</span>}
    </div>
  );
}

function Hint({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-dashed border-gray-300 bg-white px-4 py-6 text-center text-sm text-gray-500">
      {children}
    </div>
  );
}

function BriefingCard({
  item,
  mine,
  watchedCodes,
}: {
  item: BriefingItem;
  mine?: boolean;
  watchedCodes?: Set<string>;
}) {
  const meta = IMPACT_META[item.impact];
  return (
    <article
      className={`rounded-xl border bg-white p-4 ${
        mine ? "border-amber-300 ring-1 ring-amber-100" : meta.ring
      }`}
    >
      <div className="mb-1 flex items-center gap-2 text-xs font-medium">
        <span>{meta.emoji}</span>
        <span className="text-gray-500">{meta.label}</span>
      </div>
      <h2 className="text-[15px] font-semibold text-gray-900">{item.title}</h2>
      {mine && item.triggerCode && (
        <WhyLine code={item.triggerCode} date={item.date} title={item.title} />
      )}
      {item.beneficiaries.length > 0 && (
        <div className="mt-2 flex flex-wrap items-center gap-1.5">
          <span className="text-xs text-gray-400">受益 A 股</span>
          {item.beneficiaries.map((b) => {
            const watched = watchedCodes?.has(b.code);
            return (
              <Link
                key={b.code}
                href={`/stock/${b.code}`}
                title={watched ? "你的自选" : undefined}
                className={`rounded px-2 py-0.5 text-xs ${
                  watched
                    ? "bg-amber-100 font-medium text-amber-800 ring-1 ring-amber-300 hover:bg-amber-200"
                    : "bg-gray-100 text-gray-700 hover:bg-gray-200"
                }`}
              >
                {watched && <span className="mr-0.5">★</span>}
                {b.name}
              </Link>
            );
          })}
        </div>
      )}
      <div className="mt-3 rounded-lg bg-amber-50 px-3 py-2">
        <div className="mb-1 text-xs font-medium text-amber-700">散户怎么想</div>
        <p className="text-sm leading-relaxed text-gray-800">{item.retailTake}</p>
      </div>
    </article>
  );
}

// 为什么动:仅「和我相关」卡片按需拉;后端没开联网检索就返回空,这里啥也不显示(不编因果)。
function WhyLine({
  code,
  date,
  title,
}: {
  code: string;
  date: string;
  title?: string;
}) {
  const [reason, setReason] = useState<string | null>(null);
  const [asOf, setAsOf] = useState<string | null>(null);
  const [sourceUrl, setSourceUrl] = useState<string | null>(null);
  const [sourceTitle, setSourceTitle] = useState<string | null>(null);
  const [sourceSummary, setSourceSummary] = useState<string | null>(null);
  const [sourceSite, setSourceSite] = useState<string | null>(null);
  const [showSrc, setShowSrc] = useState(false);
  useEffect(() => {
    let active = true;
    fetch(
      `/api/briefing/why?code=${encodeURIComponent(code)}&date=${date}${
        title ? `&title=${encodeURIComponent(title)}` : ""
      }`,
      { cache: "no-store" }
    )
      .then((r) => r.json())
      .then((d) => {
        if (active && d?.reason) {
          setReason(d.reason);
          setAsOf(d.asOf ?? null);
          setSourceUrl(d.sourceUrl ?? null);
          setSourceTitle(d.sourceTitle ?? null);
          setSourceSummary(d.sourceSummary ?? null);
          setSourceSite(d.sourceSite ?? null);
        }
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [code, date, title]);

  if (!reason) return null;
  // 有来源摘要 → 站内弹窗展示(不跳外站);只有链接没摘要 → 退化为外链
  const hasInSite = !!(sourceTitle || sourceSummary);
  return (
    <p className="mt-1.5 text-xs leading-relaxed text-gray-500">
      <span className="font-medium text-gray-600">为什么动</span>:{reason}
      {asOf && <span className="text-gray-400"> ·{asOf}</span>}
      {hasInSite ? (
        <button
          type="button"
          onClick={() => setShowSrc(true)}
          className="text-blue-500 hover:underline"
        >
          {" "}
          ·来源
        </button>
      ) : sourceUrl ? (
        <a
          href={sourceUrl}
          target="_blank"
          rel="noreferrer"
          className="text-blue-500 hover:underline"
        >
          {" "}
          ·来源
        </a>
      ) : (
        <span className="text-gray-400"> ·以官方公告为准</span>
      )}

      {showSrc && hasInSite && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 px-4"
          onClick={() => setShowSrc(false)}
        >
          <div
            className="w-full max-w-md rounded-2xl bg-white p-5 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-3">
              <h3 className="text-sm font-semibold leading-snug text-gray-900">
                {sourceTitle ?? "来源"}
              </h3>
              <button
                type="button"
                onClick={() => setShowSrc(false)}
                className="shrink-0 text-gray-400 hover:text-gray-600"
                aria-label="关闭"
              >
                ✕
              </button>
            </div>
            <div className="mt-1 text-xs text-gray-400">
              {sourceSite && <span>{sourceSite}</span>}
              {asOf && <span> ·{asOf}</span>}
            </div>
            {sourceSummary && (
              <p className="mt-3 max-h-72 overflow-y-auto whitespace-pre-line text-sm leading-relaxed text-gray-700">
                {sourceSummary}
              </p>
            )}
            {sourceUrl && (
              <a
                href={sourceUrl}
                target="_blank"
                rel="noreferrer"
                className="mt-4 inline-block text-xs text-blue-500 hover:underline"
              >
                查看原文 ↗
              </a>
            )}
            <p className="mt-3 border-t border-gray-100 pt-2 text-[11px] text-gray-400">
              内容来自公开检索,仅供参考,以官方公告为准。
            </p>
          </div>
        </div>
      )}
    </p>
  );
}

function LockedCard({ item }: { item: BriefingItem }) {
  const meta = IMPACT_META[item.impact];
  return (
    <article className="relative overflow-hidden rounded-xl border border-gray-200 bg-white p-4">
      <div className="pointer-events-none select-none blur-[5px]">
        <div className="mb-1 flex items-center gap-2 text-xs font-medium">
          <span>{meta.emoji}</span>
          <span className="text-gray-500">{meta.label}</span>
        </div>
        <h2 className="text-[15px] font-semibold text-gray-900">{item.title}</h2>
        <p className="mt-3 text-sm text-gray-500">
          登录后查看完整分析与受益标的……
        </p>
      </div>
      <div className="absolute inset-0 flex items-center justify-center">
        <AuthButton className="rounded-full bg-gray-900 px-4 py-1.5 text-xs font-medium text-white shadow hover:bg-gray-700">
          🔓 登录解锁全部简报
        </AuthButton>
      </div>
    </article>
  );
}
