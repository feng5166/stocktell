"use client";

// 验证点跟踪·轻量版(2.3 P1-3):
// - useVerifyFollows:登录走 /api/verify-follow,游客走 localStorage,登录时合并(与 useWatchlist 同构)
// - VerifyFollowChips:验证点行内的「关注」切换(股票页一句话判断区消费)
// - VerifyProgressBanner:watchlist 板顶部——关注的验证点所属票今天被事件点名时给一行进展
//   (无进展不渲染,反焦虑:不造日更压力)
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useSession } from "next-auth/react";
import { track } from "@/lib/analytics";
import { postJson } from "@/lib/post-json";

const LS_KEY = "stocktell_verify_follows";
type Follow = { code: string; point: string };
const keyOf = (f: Follow) => `${f.code}|${f.point}`;

function readLocal(): Follow[] {
  try {
    const raw = localStorage.getItem(LS_KEY);
    const arr = raw ? (JSON.parse(raw) as Follow[]) : [];
    return Array.isArray(arr) ? arr.filter((f) => f?.code && f?.point) : [];
  } catch {
    return [];
  }
}
function writeLocal(items: Follow[]) {
  try {
    localStorage.setItem(LS_KEY, JSON.stringify(items.slice(0, 50)));
  } catch {
    /* 隐私模式忽略 */
  }
}

export function useVerifyFollows() {
  const { status } = useSession();
  const [items, setItems] = useState<Follow[]>([]);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let active = true;
    async function init() {
      if (status === "loading") return;
      if (status === "authenticated") {
        const local = readLocal();
        try {
          let d: { items?: Follow[] };
          let ok: boolean;
          if (local.length) {
            const { res, data } = await postJson<{ items?: Follow[] }>("/api/verify-follow", { merge: local });
            d = data;
            ok = res.ok;
          } else {
            const res = await fetch("/api/verify-follow");
            d = (await res.json().catch(() => ({}))) as { items?: Follow[] };
            ok = res.ok;
          }
          if (!active) return;
          if (ok && Array.isArray(d.items)) {
            setItems(d.items);
            if (local.length) writeLocal([]);
          }
        } catch {
          /* 读失败保持空,不炸 */
        }
      } else {
        setItems(readLocal());
      }
      if (active) setReady(true);
    }
    init();
    return () => {
      active = false;
    };
  }, [status]);

  const has = useCallback(
    (code: string, point: string) => items.some((f) => keyOf(f) === keyOf({ code, point })),
    [items]
  );

  const toggle = useCallback(
    (code: string, point: string) => {
      const following = has(code, point);
      const next = following
        ? items.filter((f) => keyOf(f) !== keyOf({ code, point }))
        : [...items, { code, point }];
      setItems(next); // 乐观更新
      if (!following) track("verify_point_follow", { code, point });
      else track("verify_point_unfollow", { code });
      if (status === "authenticated") {
        postJson("/api/verify-follow", { code, point }).catch(() => {
          setItems(items); // 回滚
        });
      } else {
        writeLocal(next);
      }
    },
    [items, has, status]
  );

  return { items, ready, has, toggle };
}

// 验证点 chips(股票页):每个验证点旁给「关注」切换。点过的进展在自选页/微信早报兑现。
export function VerifyFollowChips({ code, points }: { code: string; points: string[] }) {
  const vf = useVerifyFollows();
  if (points.length === 0) return null;
  return (
    <div className="mt-1.5 flex flex-wrap gap-1.5">
      {points.map((p) => {
        const on = vf.has(code, p);
        return (
          <button
            key={p}
            onClick={() => vf.toggle(code, p)}
            title={on ? "取消关注该验证点" : "关注:该票被事件点名时,在自选页提醒你看这个验证点"}
            className={`rounded-full border px-2 py-0.5 text-[11px] transition-colors ${
              on
                ? "border-brand-200 bg-brand-50 text-brand-700"
                : "border-gray-200 bg-white text-gray-500 hover:border-brand-200 hover:text-brand-600"
            }`}
          >
            {on ? "🔔 " : "+ "}
            {p}
          </button>
        );
      })}
      <span className="self-center text-[10px] text-gray-300">关注验证点:有进展信号时在自选页提示</span>
    </div>
  );
}

// 进展条(watchlist 板):关注的验证点所属票今天被事件点名 → 一行提示。无进展不渲染。
export function VerifyProgressBanner({
  signalCodes,
  names,
}: {
  signalCodes: Set<string>;
  names: Record<string, { name: string; market: string }>;
}) {
  const vf = useVerifyFollows();
  const hits = vf.items.filter((f) => signalCodes.has(f.code));
  if (!vf.ready || hits.length === 0) return null;
  return (
    <div className="rounded-xl bg-amber-50 px-4 py-3">
      <div className="text-xs font-medium text-amber-800">🔔 你关注的验证点今天有进展信号</div>
      <ul className="mt-1 space-y-1">
        {hits.slice(0, 5).map((f) => (
          <li key={keyOf(f)} className="text-xs leading-relaxed text-amber-800/90">
            <Link
              href={`/stock/${f.code}`}
              onClick={() => track("verify_point_progress_click", { code: f.code })}
              className="font-medium underline-offset-2 hover:underline"
            >
              {names[f.code]?.name ?? f.code}
            </Link>
            「{f.point}」——它今天被事件点名,去看当日依据是否涉及这个验证点
          </li>
        ))}
      </ul>
      <p className="mt-1 text-[10px] text-amber-700/70">
        进展信号=该票出现在今日传导链,不代表验证点已兑现;以公开披露为准,不构成投资建议。
      </p>
    </div>
  );
}
