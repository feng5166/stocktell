"use client";

// 自选状态(客户端):登录用户走 /api/watchlist,游客走 localStorage,接口同构。
// 登录瞬间若本地有自选,自动合并进库再清本地,别让用户丢自选。
// 游客可零门槛加自选(利于首次转化);"有自选的游客换页时"由 GuestWatchlistNudge 轻推登录。
import { useCallback, useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { track } from "@/lib/analytics";
import { useToast } from "@/components/Toast";
import { ETF_CODES } from "@/data/etfs";

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

// initialCodes:服务端为登录用户预取的自选。提供时首屏即用它渲染(ready=true),
// 且在无本地待合并的情况下跳过 /api/watchlist 拉取,省掉 session→watchlist 一跳。
export function useWatchlist(initialCodes?: string[]): UseWatchlist {
  const { status } = useSession();
  const toast = useToast();
  const [codes, setCodes] = useState<Set<string>>(
    () => new Set(initialCodes ?? [])
  );
  const [ready, setReady] = useState(initialCodes != null);

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
        // 服务端已预取自选且无本地待合并 → 跳过这次 GET(首屏已用 initialCodes 渲染)
        if (initialCodes != null) {
          if (active) setReady(true);
          return;
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
    // 兜底:status 若长时间卡在 "loading"(session 端点慢/客户端水合异常),别让"和我相关"永远转圈——
    // 4s 后直接按 cookie 取一次自选(登录用户返回 codes;游客/未登录走本地),置 ready。
    const fallback = setTimeout(async () => {
      if (!active || status !== "loading" || ready) return;
      const r = await fetch("/api/watchlist", { cache: "no-store" })
        .then((x) => x.json())
        .catch(() => null);
      if (!active) return;
      setCodes(
        new Set<string>(r && r.ok && Array.isArray(r.codes) ? r.codes : readLocal())
      );
      setReady(true);
    }, 4000);
    return () => {
      active = false;
      clearTimeout(fallback);
    };
    // initialCodes 由服务端一次性注入、引用稳定,只需随登录态变化重跑
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status]);

  const has = useCallback((code: string) => codes.has(code), [codes]);

  const toggle = useCallback(
    (code: string) => {
      const adding = !codes.has(code);
      const next = new Set(codes);
      if (adding) next.add(code);
      else next.delete(code);
      setCodes(next); // 乐观更新:先点亮/熄灭

      const kind = ETF_CODES.includes(code) ? "etf" : "stock";
      if (adding) track("add_watchlist", { kind });
      else track("remove_watchlist", { kind }); // 取消自选也记:看"加了又删"的比例(黏性信号)

      const ADDED_MSG = "已加入自选 · 首页「和我相关」会给你看相关动态";
      // 失败回滚 + 提示:不再静默吞掉(旧版 .catch(()=>{}) 会让用户以为加了、刷新却没了)
      const rollback = () => {
        setCodes((prev) => {
          const n = new Set(prev);
          if (adding) n.delete(code);
          else n.add(code);
          return n;
        });
        toast(adding ? "加自选没成功,请重试" : "取消自选没成功,请重试", { error: true });
      };

      if (status === "authenticated") {
        const req = adding
          ? fetch("/api/watchlist", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ code }),
            })
          : fetch(`/api/watchlist?code=${encodeURIComponent(code)}`, {
              method: "DELETE",
            });
        req
          .then((r) => {
            if (!r.ok) rollback();
            else if (adding) toast(ADDED_MSG);
          })
          .catch(rollback);
      } else {
        writeLocal(Array.from(next)); // 游客:写 localStorage(内部已兜异常)
        if (adding) toast(ADDED_MSG);
      }
    },
    [codes, status, toast]
  );

  return { codes, ready, loggedIn: status === "authenticated", has, toggle };
}
