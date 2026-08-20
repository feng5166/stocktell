"use client";

import { useEffect, useMemo, useState } from "react";

export type ChainQuote = { price: number; change: number; asOf?: string };
export type ChainQuotePayload = {
  quotes: Record<string, ChainQuote>;
  live: boolean;
  cached: boolean;
  asOf: string | null;
};

const resultCache = new Map<string, { at: number; payload: ChainQuotePayload }>();
const inFlight = new Map<string, Promise<ChainQuotePayload>>();
const LOCAL_TTL = 10_000;

async function requestQuotes(symbols: string): Promise<ChainQuotePayload> {
  const cachedResult = resultCache.get(symbols);
  if (cachedResult && Date.now() - cachedResult.at < LOCAL_TTL) {
    return cachedResult.payload;
  }
  const pending = inFlight.get(symbols);
  if (pending) return pending;

  const request = fetch(`/api/quotes?symbols=${encodeURIComponent(symbols)}`, {
    cache: "no-store",
  })
    .then((response) => {
      if (!response.ok) throw new Error("quote request failed");
      return response.json();
    })
    .then((data): ChainQuotePayload => ({
      quotes: data.quotes ?? {},
      live: Boolean(data.live),
      cached: Boolean(data.cached),
      asOf: data.asOf ?? null,
    }))
    .then((payload) => {
      resultCache.set(symbols, { at: Date.now(), payload });
      return payload;
    })
    .finally(() => inFlight.delete(symbols));
  inFlight.set(symbols, request);
  return request;
}

export function useChainQuotes(codes: string[]) {
  const symbols = useMemo(
    () => Array.from(new Set(codes)).join(","),
    // 调用方通常每次渲染都会创建 codes 数组,用内容而不是引用做依赖。
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [codes.join(",")]
  );
  const [payload, setPayload] = useState<ChainQuotePayload | null>(
    () => resultCache.get(symbols)?.payload ?? null
  );

  useEffect(() => {
    if (!symbols) return;
    let active = true;
    let timer: ReturnType<typeof setInterval> | null = null;

    const load = () => {
      requestQuotes(symbols)
        .then((next) => {
          if (active) setPayload(next);
        })
        .catch(() => {
          if (active && !resultCache.has(symbols)) {
            setPayload({ quotes: {}, live: false, cached: false, asOf: null });
          }
        });
    };
    const start = () => {
      if (!timer) timer = setInterval(load, 20_000);
    };
    const stop = () => {
      if (timer) clearInterval(timer);
      timer = null;
    };
    const onVisibility = () => {
      if (document.hidden) stop();
      else {
        load();
        start();
      }
    };

    load();
    if (!document.hidden) start();
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      active = false;
      stop();
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [symbols]);

  return payload;
}
