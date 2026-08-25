"use client";

import Link from "next/link";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { aSharePeers, STOCK_MAP, STOCKS } from "@/data/stocks";
import { useChainQuotes } from "@/components/chain/useChainQuotes";
import { changeClass, fmtChange } from "@/lib/format";
import { formatBeijingMDHM, formatYmdMD } from "@/lib/time-label";
import type { ChainSentiment } from "@/lib/sentiment";
import type {
  SegmentFundRow,
  SegmentFundStatus,
} from "@/lib/segment-fund-status";

type Member = { code: string; name: string };
const EMPTY_QUOTES: Record<string, { price: number; change: number; asOf?: string }> = {};
const ALL_QUOTE_CODES = STOCKS.map((stock) => stock.code);

export type TemperatureSegment = {
  name: string;
  plain: string;
  verify: string[];
  members: Member[];
};

const fmtSigned = (value: number, digits = 2) =>
  `${value > 0 ? "+" : ""}${value.toFixed(digits)}%`;

const md = (date: string) =>
  `${Number(date.slice(5, 7))}/${Number(date.slice(8, 10))}`;

function tone(value: number | null | undefined) {
  if (value == null) return "数据整理中";
  if (value >= 0.8) return "明显偏强";
  if (value >= 0.15) return "小幅偏强";
  if (value <= -0.8) return "明显承压";
  if (value <= -0.15) return "小幅承压";
  return "分化震荡";
}

function buildJudgment(
  sentiment: ChainSentiment | null,
  fundStatus: SegmentFundStatus | null
) {
  const pieces: string[] = [];
  if (sentiment?.us) pieces.push(`隔夜美股 AI 链${tone(sentiment.us.avgPct)}`);
  if (sentiment?.a) pieces.push(`A 股核定样本${tone(sentiment.a.avgPct)}`);
  const prefix = pieces.length ? `${pieces.join("，")}；` : "";
  return `${prefix}${fundStatus?.summary ?? "链内资金与行情数据正在整理。"}`;
}

function SegmentTile({
  row,
  selected,
  onSelect,
}: {
  row: SegmentFundRow;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      onClick={onSelect}
      className={`min-w-0 rounded-lg px-3 py-2.5 text-left transition-colors ${
        selected ? "bg-gray-100" : "bg-gray-50 hover:bg-gray-100"
      }`}
    >
      <span className="flex items-center justify-between gap-2">
        <span
          className={`truncate text-xs font-medium ${
            selected ? "text-gray-900" : "text-gray-800"
          }`}
        >
          {row.segment}
        </span>
        <span className={`shrink-0 font-mono text-xs font-semibold ${changeClass(row.avgPct)}`}>
          {fmtSigned(row.avgPct)}
        </span>
      </span>
      <span className="mt-1 flex items-center justify-between gap-2 text-[11px] text-gray-400">
        <span className="truncate">{row.state}</span>
        <span className="shrink-0">净额/成交 {fmtSigned(row.strengthPct)}</span>
      </span>
    </button>
  );
}

export function ChainTemperatureBoard({
  initialSentiment,
  initialFundStatus,
  segments,
  usMembers,
  action,
}: {
  initialSentiment?: ChainSentiment | null;
  initialFundStatus?: SegmentFundStatus | null;
  segments: TemperatureSegment[];
  usMembers: Member[];
  action?: ReactNode;
}) {
  const [sentiment, setSentiment] = useState<ChainSentiment | null>(
    initialSentiment ?? null
  );
  const [fundStatus, setFundStatus] = useState<SegmentFundStatus | null>(
    initialFundStatus ?? null
  );
  const [selectedName, setSelectedName] = useState(
    initialFundStatus?.rows[0]?.segment ?? segments[0]?.name ?? ""
  );

  useEffect(() => {
    let active = true;
    Promise.allSettled([
      fetch("/api/chain-sentiment", { cache: "no-store" }).then((response) => {
        if (!response.ok) throw new Error("sentiment request failed");
        return response.json();
      }),
      fetch("/api/segment-fund-status", { cache: "no-store" }).then((response) => {
        if (!response.ok) throw new Error("fund status request failed");
        return response.json();
      }),
    ]).then(([sentimentResult, fundResult]) => {
      if (!active) return;
      if (sentimentResult.status === "fulfilled" && sentimentResult.value) {
        setSentiment(sentimentResult.value);
      }
      if (fundResult.status === "fulfilled" && fundResult.value?.rows?.length) {
        setFundStatus(fundResult.value);
        setSelectedName((current) => current || fundResult.value.rows[0].segment);
      }
    });
    return () => {
      active = false;
    };
  }, []);

  const quotePayload = useChainQuotes(ALL_QUOTE_CODES);
  const quotes = quotePayload?.quotes ?? EMPTY_QUOTES;

  const sortedUsQuotes = useMemo(
    () =>
      usMembers
        .map((member) => ({ ...member, quote: quotes[member.code] }))
        .filter(
          (item): item is Member & { quote: { price: number; change: number; asOf?: string } } =>
            item.quote != null && Number.isFinite(item.quote.change)
        )
        .sort((a, b) => Math.abs(b.quote.change) - Math.abs(a.quote.change)),
    [quotes, usMembers]
  );
  const usMovers = sortedUsQuotes.slice(0, 4);

  const rows = fundStatus?.rows ?? [];
  const selectedRow = rows.find((row) => row.segment === selectedName) ?? rows[0] ?? null;
  const selectedSegment =
    segments.find((segment) => segment.name === selectedRow?.segment) ?? segments[0] ?? null;
  const selectedCodes = new Set(selectedSegment?.members.map((member) => member.code) ?? []);
  const matchedTrigger = sortedUsQuotes.find((mover) => {
    const stock = STOCK_MAP[mover.code];
    return stock && aSharePeers(stock).some((peer) => selectedCodes.has(peer.code));
  });
  const relatedTrigger = matchedTrigger ?? usMovers[0];

  const stockSamples = useMemo(
    () =>
      (selectedSegment?.members ?? [])
        .map((member) => ({ ...member, quote: quotes[member.code] }))
        .sort((a, b) => {
          if (!a.quote) return 1;
          if (!b.quote) return -1;
          return Math.abs(b.quote.change) - Math.abs(a.quote.change);
        })
        .slice(0, 4),
    [quotes, selectedSegment]
  );

  const quoteTime = formatBeijingMDHM(quotePayload?.asOf ?? null);
  const fundTime = fundStatus?.date ? `${md(fundStatus.date)} 收盘` : null;
  const usDate = usMovers
    .map((item) => item.quote.asOf)
    .filter((date): date is string => Boolean(date))
    .sort()
    .at(-1);
  const fallbackIndices = sentiment?.us?.indices?.slice(0, 4) ?? [];
  const upCount = stockSamples.filter((item) => (item.quote?.change ?? 0) > 0).length;
  const downCount = stockSamples.filter((item) => (item.quote?.change ?? 0) < 0).length;
  const coveredSamples = stockSamples.filter((item) => item.quote).length;
  const triggerLabel = relatedTrigger
    ? `${relatedTrigger.name} ${fmtChange(relatedTrigger.quote.change)}${matchedTrigger ? "" : "（市场参考）"}`
    : "隔夜触发数据整理中";
  const segmentLabel = selectedRow
    ? `${selectedRow.segment} ${fmtSigned(selectedRow.avgPct)} · ${selectedRow.relation}`
    : selectedSegment?.name ?? "链内环节整理中";
  const sampleLabel = coveredSamples > 0
    ? `核定样本 ${upCount} 涨 / ${downCount} 跌`
    : "核定样本行情整理中";

  return (
    <section className="mb-4 rounded-xl bg-white px-4 py-4 shadow-sm sm:px-5">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p data-no-entity-links className="text-meta font-medium text-gray-500">
            AI 产业链 · 今日状态
          </p>
          <h2 className="mt-0.5 text-h2 font-semibold text-gray-900">今天这条链怎么走</h2>
        </div>
        <p className="text-right text-meta text-gray-400">
          {quoteTime
            ? `${quotePayload?.cached || !quotePayload?.live ? "缓存截至" : "行情截至"} ${quoteTime}`
            : sentiment?.a?.pctLive
              ? `行情截至 ${sentiment.a.pctAsOf}`
              : sentiment?.a?.pctAsOf
                ? `${formatYmdMD(sentiment.a.pctAsOf)} 收盘`
                : "行情整理中"}
          {fundTime ? ` · 资金 ${fundTime}` : ""}
        </p>
      </div>

      <div className="mt-3 rounded-lg bg-gray-50 px-3 py-3">
        <p className="text-meta font-medium text-gray-500">一句话判断</p>
        <p className="mt-1 text-sm font-medium leading-relaxed text-gray-800">
          {buildJudgment(sentiment, fundStatus)}
        </p>
        <p className="mt-1.5 text-xs leading-relaxed text-gray-500">
          今天先看：{selectedRow?.verify.join(" / ") ?? "海外触发是否延续 / 链内资金是否同向 / 订单是否出现新证据"}
        </p>
      </div>

      <div className="mt-4 flex items-baseline justify-between gap-3">
        <div>
          <p className="text-meta font-medium text-gray-500">产业链热力</p>
          <h3 className="mt-0.5 text-sm font-semibold text-gray-800">
            从触发源一路看到 A 股验证
          </h3>
        </div>
        <span className="shrink-0 text-[11px] text-gray-400">红涨绿跌 · 点击环节切换</span>
      </div>

      <div className="mt-3">
        <div className="mb-2 flex items-center gap-2 text-xs font-medium text-gray-700">
          <span className="text-gray-400">01</span> 全球触发
          {usDate && <span className="ml-auto text-[11px] font-normal text-gray-400">截至 {formatYmdMD(usDate)} 美东</span>}
        </div>
        <div className="grid grid-cols-2 gap-2">
          {usMovers.length > 0
            ? usMovers.map((item) => (
                <Link
                  key={item.code}
                  href={`/stock/${item.code}`}
                  className="flex min-w-0 items-center justify-between gap-2 rounded-lg bg-gray-50 px-3 py-2.5 hover:bg-gray-100"
                >
                  <span className="truncate text-xs font-medium text-gray-800">{item.name}</span>
                  <span className={`shrink-0 font-mono text-xs font-semibold ${changeClass(item.quote.change)}`}>
                    {fmtChange(item.quote.change)}
                  </span>
                </Link>
              ))
            : fallbackIndices.map((item) => (
                <div
                  key={item.name}
                  className="flex min-w-0 items-center justify-between gap-2 rounded-lg bg-gray-50 px-3 py-2.5"
                >
                  <span className="truncate text-xs font-medium text-gray-800">{item.name}</span>
                  <span className={`shrink-0 font-mono text-xs font-semibold ${changeClass(item.change)}`}>
                    {fmtChange(item.change)}
                  </span>
                </div>
              ))}
        </div>
      </div>

      <div className="my-3 flex items-center gap-2 text-gray-200" aria-hidden="true">
        <span className="h-px flex-1 bg-gray-100" />
        <span className="text-sm">↓</span>
        <span className="h-px flex-1 bg-gray-100" />
      </div>

      <div>
        <div className="mb-2 flex items-center gap-2 text-xs font-medium text-gray-700">
          <span className="text-gray-400">02</span> 链内环节
          {fundStatus?.scope && (
            <span className="ml-auto truncate text-[11px] font-normal text-gray-400">核定样本</span>
          )}
        </div>
        {rows.length > 0 ? (
          <div className="grid grid-cols-2 gap-2">
            {rows.map((row) => (
              <SegmentTile
                key={row.segment}
                row={row}
                selected={row.segment === selectedRow?.segment}
                onSelect={() => setSelectedName(row.segment)}
              />
            ))}
          </div>
        ) : (
          <div className="rounded-lg bg-gray-50 px-3 py-3 text-xs text-gray-400">
            收盘资金数据生成中，稍后刷新看看。
          </div>
        )}
      </div>

      <div className="my-3 flex items-center gap-2 text-gray-200" aria-hidden="true">
        <span className="h-px flex-1 bg-gray-100" />
        <span className="text-sm">↓</span>
        <span className="h-px flex-1 bg-gray-100" />
      </div>

      <div>
        <div className="mb-2 flex items-center gap-2 text-xs font-medium text-gray-700">
          <span className="text-gray-400">03</span> A 股核定样本
          <span className="ml-auto text-[11px] font-normal text-gray-400">
            {selectedSegment?.name ?? "当前环节"}
          </span>
        </div>
        <div className="grid grid-cols-2 gap-2">
          {stockSamples.map((item) => (
            <Link
              key={item.code}
              href={`/stock/${item.code}`}
              className="flex min-w-0 items-center justify-between gap-2 rounded-lg bg-gray-50 px-3 py-2.5 hover:bg-gray-100"
            >
              <span className="truncate text-xs font-medium text-gray-800">{item.name}</span>
              <span
                className={`shrink-0 font-mono text-xs font-semibold ${
                  item.quote ? changeClass(item.quote.change) : "text-gray-300"
                }`}
              >
                {item.quote ? fmtChange(item.quote.change) : "—"}
              </span>
            </Link>
          ))}
        </div>
      </div>

      <div className="mt-4 rounded-lg bg-gray-50 px-3 py-3">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs font-medium text-gray-800">
          <span>{triggerLabel}</span>
          <span className="text-gray-300">→</span>
          <span>{segmentLabel}</span>
          <span className="text-gray-300">→</span>
          <span>{sampleLabel}</span>
        </div>
        <p className="mt-1.5 text-xs leading-relaxed text-gray-600">
          {selectedRow
            ? `资金${selectedRow.state}，链内净额/成交比 ${fmtSigned(selectedRow.strengthPct)}；价格与资金${selectedRow.relation === "暂不一致" ? "暂未形成一致方向" : selectedRow.relation}。下一步验证：${selectedRow.verify.join(" / ")}。`
            : `${selectedSegment?.plain ?? "当前环节"}。行情只是触发源，仍需通过订单、收入和客户披露验证。`}
        </p>
        {selectedSegment && (
          <div className="mt-2 text-right">
            <Link
              href={`/chain/ai?segment=${encodeURIComponent(selectedSegment.name)}#chain-roster`}
              className="text-xs font-medium text-brand-600 hover:underline"
            >
              查看这个环节 →
            </Link>
          </div>
        )}
      </div>

      <div className="mt-3 flex flex-wrap items-end justify-between gap-2">
        <p className="max-w-xl text-[11px] leading-relaxed text-gray-400">
          涨跌只是当天市场表现；链内资金仅统计 StockTell 已核定的 AI 产业链样本，不代表全市场板块排名，也不等于订单或收入证据。
        </p>
        {action && <div className="ml-auto shrink-0 text-right">{action}</div>}
      </div>
    </section>
  );
}
