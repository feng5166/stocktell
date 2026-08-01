"use client";

// 新手路径 v2(2026-08-01)· 消灭"安静票黑洞"的两张卡:
// - InstantTake:本会话刚加的那只票,当场自动流式给一段「现在怎么看」LLM 人话
//   (走 /api/briefing/explain {code},按 票×日 共享缓存;游客免登录)。aha 不等第二天。
// - QuietWatchCard:安静日(自选无命中简报)逐票给一句 positioning 人话 + 链身份 chip,
//   「拆一下」按需触发解读。骨架全是静态/已有数据,0 秒渲染,不依赖当日简报。
import { useEffect, useState } from "react";
import Link from "next/link";
import { STOCK_MAP, resolvePeer } from "@/data/stocks";
import { DeepRead } from "@/components/DeepRead";
import { LAST_ADDED_KEY, WATCH_ADDED_EVT } from "@/components/useWatchlist";
import type { WatchChainInfo } from "@/lib/watch-relation";

function ChainChip({ info }: { info?: WatchChainInfo }) {
  if (!info) return null;
  return (
    <span className="ml-1.5 inline-flex items-center gap-1 rounded bg-brand-50 px-1.5 py-0.5 text-[10px] text-brand-600">
      {info.chainName} · {info.segment} · {info.relation}
    </span>
  );
}

/** 刚加的那只票:当场自动解读(即时兑现 aha)。无"刚加"记录时不渲染。 */
export function InstantTake({
  codes,
  chainMap,
}: {
  codes: Set<string>;
  chainMap?: Record<string, WatchChainInfo>;
}) {
  const [code, setCode] = useState<string | null>(null);
  useEffect(() => {
    try {
      setCode(sessionStorage.getItem(LAST_ADDED_KEY));
    } catch {
      /* 隐私模式 */
    }
    const onAdd = (e: Event) => {
      const c = (e as CustomEvent<{ code: string }>).detail?.code;
      if (c) setCode(c);
    };
    window.addEventListener(WATCH_ADDED_EVT, onAdd);
    return () => window.removeEventListener(WATCH_ADDED_EVT, onAdd);
  }, []);

  if (!code || !codes.has(code)) return null;
  const s = STOCK_MAP[code];
  if (!s) return null;
  const info = chainMap?.[code];
  // 「第一份传导地图」骨架:上游美股锚点 → 所在环节 → 这只票(全部静态数据,零 LLM 零幻觉)
  const anchors = (s.relations || [])
    .map((t) => resolvePeer(t))
    .filter((p): p is NonNullable<typeof p> => Boolean(p) && p!.market === "美股")
    .slice(0, 2);
  return (
    <div className="rounded-xl border border-brand-100 bg-white p-3 sm:p-4">
      <div className="text-xs font-medium text-gray-600">
        ⭐ 你刚加了 <span className="font-semibold text-gray-900">{s.name}</span>
        <ChainChip info={info} />
      </div>
      <p className="mt-1 text-sm leading-relaxed text-gray-800">{s.positioning}</p>
      {(anchors.length > 0 || info) && (
        <div className="mt-2 rounded-lg bg-gray-50 px-2.5 py-2 text-xs leading-relaxed text-gray-600">
          <span className="font-medium text-gray-700">它的传导位置:</span>
          {anchors.length > 0 && (
            <>
              {anchors.map((a) => a.name).join("/")}
              <span className="mx-1 text-gray-400">→</span>
            </>
          )}
          {info ? (
            <>
              「{info.segment}」环节
              <span className="mx-1 text-gray-400">→</span>
            </>
          ) : null}
          {s.name}
          {info && info.verify.length > 0 && (
            <span className="ml-2 text-gray-500">盯:{info.verify.slice(0, 2).join("、")}</span>
          )}
          {info && (
            <Link
              href={`/chain/${info.chainId}`}
              className="ml-2 font-medium text-brand-600 hover:underline"
            >
              看这条链完整传导 →
            </Link>
          )}
        </div>
      )}
      {/* key=code:换一只"刚加的票"时整块重挂,自动重新解读 */}
      <DeepRead key={code} payload={{ code }} autoStart label="🔍 看 StockTell 现在怎么看 →" />
      <p className="mt-1.5 text-[10px] text-gray-400">
        关系为研究框架梳理·非确认;
        <Link href="/track" className="text-gray-500 underline hover:text-gray-700">
          历史复盘可回查 →
        </Link>
      </p>
    </div>
  );
}

/** 安静日兜底:每只自选票一行人话(positioning)+ 链身份 + 按需拆解。 */
export function QuietWatchCard({
  codes,
  chainMap,
}: {
  codes: Set<string>;
  chainMap?: Record<string, WatchChainInfo>;
}) {
  const [exclude, setExclude] = useState<string | null>(null);
  useEffect(() => {
    try {
      setExclude(sessionStorage.getItem(LAST_ADDED_KEY)); // InstantTake 已展示,避免重复
    } catch {
      /* 隐私模式 */
    }
  }, []);

  const rows = Array.from(codes)
    .filter((c) => c !== exclude && STOCK_MAP[c])
    .slice(0, 6)
    .map((c) => ({ code: c, s: STOCK_MAP[c] }));
  if (rows.length === 0) return null;

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-3 sm:p-4">
      <div className="text-xs font-medium text-gray-600">
        今天没踩雷,各说一句它是干嘛的 👇
      </div>
      <div className="mt-2 divide-y divide-gray-100">
        {rows.map(({ code, s }) => (
          <div key={code} className="py-2 first:pt-0 last:pb-0">
            <div className="text-sm font-medium text-gray-800">
              {s.name}
              <span className="ml-1.5 font-mono text-[11px] text-gray-400">{code}</span>
              <ChainChip info={chainMap?.[code]} />
            </div>
            <p className="mt-0.5 text-xs leading-relaxed text-gray-600">{s.positioning}</p>
            <DeepRead payload={{ code }} label="🔍 拆一下这只票 →" />
          </div>
        ))}
      </div>
      <p className="mt-2 text-[10px] text-gray-400">
        以上为产业链定位说明,不构成投资建议 · 有异动我会在这儿第一时间对给你看 👀 ·{" "}
        <Link href="/track" className="text-gray-500 underline hover:text-gray-700">
          历史复盘可回查 →
        </Link>
      </p>
    </div>
  );
}
