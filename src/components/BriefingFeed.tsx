"use client";

// 今日简报信息流:把简报按"是否命中我的自选"分成「和我相关」+「其他市场动态」。
// 和我相关一律不锁(先认我,别拿用户自己的票去设墙);免费墙只作用于其他动态。
import Link from "next/link";
import { useEffect, useState } from "react";
import type { BriefingItem } from "@/lib/briefings";
import { AuthButton } from "@/components/auth/AuthButton";
import { useWatchlist } from "@/components/useWatchlist";

const FREE_LIMIT = 3;

const IMPACT_META: Record<
  BriefingItem["impact"],
  { dot: string; label: string; ring: string }
> = {
  高: { dot: "🔴", label: "高影响", ring: "border-rose-200" },
  中: { dot: "🟡", label: "中影响", ring: "border-amber-200" },
  低: { dot: "🟢", label: "低影响", ring: "border-emerald-200" },
};

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
        ) : mine.length === 0 ? (
          <Hint>今天你的自选没有相关动态,安心上班 ☕</Hint>
        ) : (
          <div className="space-y-3">
            {mine.map((it) => (
              <BriefingCard key={it.id} item={it} mine watchedCodes={wl.codes} />
            ))}
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
        <span>{meta.dot}</span>
        <span className="text-gray-500">{meta.label}</span>
        {mine && (
          <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[11px] text-amber-700">
            你的自选
          </span>
        )}
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
        }
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [code, date, title]);

  if (!reason) return null;
  return (
    <p className="mt-1.5 text-xs leading-relaxed text-gray-500">
      <span className="font-medium text-gray-600">为什么动</span>:{reason}
      {asOf && <span className="text-gray-400"> ·{asOf}</span>}
      {sourceUrl ? (
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
    </p>
  );
}

function LockedCard({ item }: { item: BriefingItem }) {
  const meta = IMPACT_META[item.impact];
  return (
    <article className="relative overflow-hidden rounded-xl border border-gray-200 bg-white p-4">
      <div className="pointer-events-none select-none blur-[5px]">
        <div className="mb-1 flex items-center gap-2 text-xs font-medium">
          <span>{meta.dot}</span>
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
