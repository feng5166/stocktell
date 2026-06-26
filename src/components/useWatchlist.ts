"use client";

// 自选状态(客户端):登录用户走 /api/watchlist,游客走 localStorage,接口同构。
// 登录瞬间若本地有自选,自动合并进库再清本地,别让用户丢自选。
import { useCallback, useEffect, useState } from "react";
import { useSession } from "next-auth/react";

const LS_KEY = "stocktell_watchlist";

function readLocal(): string[] {
  if (typeof window === "undefined") return [];
  try {
    const v = JSON.parse(localStorage.getItem(LS_KEY) || "[]");
    return Array.isArray(v) ? v.filter((x) => typeof x === "string") : [];
  } catch {
    return [];
  }
}
function writeLocal(codes: string[]) {
  try {
    localStorage.setItem(LS_KEY, JSON.stringify(codes));
  } catch {
    /* 忽略隐私模式等写入失败 */
  }
}

export interface UseWatchlist {
  codes: Set<string>;
  ready: boolean;
  loggedIn: boolean;
  has: (code: string) => boolean;
  toggle: (code: string) => void;
}

export function useWatchlist(): UseWatchlist {
  const { status } = useSession();
  const [codes, setCodes] = useState<Set<string>>(new Set());
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let active = true;
    async function init() {
      if (status === "loading") return;
      if (status === "authenticated") {
        const local = readLocal();
        // 有本地自选 → 登录迁移:合并进库后清本地
        if (local.length) {
          const r = await fetch("/api/watchlist", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ merge: local }),
          })
            .then((x) => x.json())
            .catch(() => null);
          if (active && r?.ok) {
            writeLocal([]);
            setCodes(new Set<string>(r.codes));
            setReady(true);
            return;
          }
        }
        const r = await fetch("/api/watchlist", { cache: "no-store" })
          .then((x) => x.json())
          .catch(() => null);
        if (active) {
          setCodes(new Set<string>(r?.codes ?? []));
          setReady(true);
        }
      } else {
        // 游客
        if (active) {
          setCodes(new Set<string>(readLocal()));
          setReady(true);
        }
      }
    }
    init();
    return () => {
      active = false;
    };
  }, [status]);

  const has = useCallback((code: string) => codes.has(code), [codes]);

  const toggle = useCallback(
    (code: string) => {
      setCodes((prev) => {
        const next = new Set(prev);
        const adding = !next.has(code);
        if (adding) next.add(code);
        else next.delete(code);

        if (status === "authenticated") {
          if (adding) {
            fetch("/api/watchlist", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ code }),
            }).catch(() => {});
          } else {
            fetch(`/api/watchlist?code=${encodeURIComponent(code)}`, {
              method: "DELETE",
            }).catch(() => {});
          }
        } else {
          writeLocal(Array.from(next));
        }
        return next;
      });
    },
    [status]
  );

  return { codes, ready, loggedIn: status === "authenticated", has, toggle };
}
