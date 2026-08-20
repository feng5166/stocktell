"use client";

import Link from "next/link";
import { useMemo } from "react";
import { changeClass, fmtChange } from "@/lib/format";
import { formatBeijingMDHM } from "@/lib/time-label";
import { useChainQuotes, type ChainQuote } from "@/components/chain/useChainQuotes";

type Member = { code: string; name: string };

export function ChainQuoteSnapshot({
  members,
  title,
}: {
  members: Member[];
  title: string;
}) {
  const payload = useChainQuotes(members.map((member) => member.code));
  const quotes = payload?.quotes ?? null;
  const live = payload?.live ?? false;
  const cached = payload?.cached ?? false;
  const asOf = payload?.asOf ?? null;

  const items = useMemo(
    () =>
      members
        .map((member) => ({ ...member, quote: quotes?.[member.code] }))
        .filter(
          (item): item is Member & { quote: ChainQuote } =>
            item.quote != null && Number.isFinite(item.quote.change)
        ),
    [members, quotes]
  );
  const up = items.filter((item) => item.quote.change > 0).length;
  const down = items.filter((item) => item.quote.change < 0).length;
  const flat = items.length - up - down;
  const average = items.length
    ? items.reduce((sum, item) => sum + item.quote.change, 0) / items.length
    : null;
  const sorted = [...items].sort((a, b) => b.quote.change - a.quote.change);
  const best = sorted[0];
  const worst = sorted.at(-1);
  const timeLabel = formatBeijingMDHM(asOf);

  return (
    <section className="mt-4 rounded-xl bg-white px-4 py-3 shadow-sm">
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="text-sm font-semibold text-gray-800">{title}</h2>
        <span className="shrink-0 text-xs text-gray-400">
          {timeLabel
            ? `${cached || !live ? "缓存截至" : "行情截至"} ${timeLabel}`
            : quotes
              ? "行情暂不可用"
              : "行情读取中"}
        </span>
      </div>

      {items.length > 0 ? (
        <>
          <div className="mt-2 flex flex-wrap items-baseline gap-x-3 gap-y-1 text-sm">
            <span className="text-gray-500">覆盖 {items.length}/{members.length} 只</span>
            <span className="text-rose-600">上涨 {up}</span>
            <span className="text-emerald-600">下跌 {down}</span>
            {flat > 0 && <span className="text-gray-400">平盘 {flat}</span>}
            {average != null && (
              <span className="text-gray-500">
                样本平均{" "}
                <span className={`font-mono font-semibold ${changeClass(average)}`}>
                  {fmtChange(average)}
                </span>
              </span>
            )}
          </div>
          <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-gray-500">
            {best && best.quote.change > 0 && (
              <span>
                涨幅居前{" "}
                <Link href={`/stock/${best.code}`} className="font-medium text-gray-700 hover:underline">
                  {best.name}
                </Link>{" "}
                <span className={changeClass(best.quote.change)}>{fmtChange(best.quote.change)}</span>
              </span>
            )}
            {worst && worst.quote.change < 0 && worst.code !== best?.code && (
              <span>
                回撤较多{" "}
                <Link href={`/stock/${worst.code}`} className="font-medium text-gray-700 hover:underline">
                  {worst.name}
                </Link>{" "}
                <span className={changeClass(worst.quote.change)}>{fmtChange(worst.quote.change)}</span>
              </span>
            )}
          </div>
        </>
      ) : (
        <p className="mt-2 text-xs text-gray-400">
          {quotes ? "当前没有可用的核定样本行情。" : "正在读取核定样本的最新行情…"}
        </p>
      )}

      <p className="mt-2 text-[11px] leading-relaxed text-gray-400">
        样本平均为当前页核定成分的等权涨跌幅,用于观察链内表现,不是全市场板块指数。
      </p>
    </section>
  );
}
