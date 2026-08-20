"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { changeClass } from "@/lib/format";
import type {
  PriceFlowRelation,
  SegmentFundRow,
  SegmentFundStatus as SegmentFundStatusData,
} from "@/lib/segment-fund-status";

const fmtSigned = (v: number, digits = 2) =>
  `${v > 0 ? "+" : ""}${v.toFixed(digits)}`;

const relationCopy: Record<PriceFlowRelation, string> = {
  同向: "价格与资金同向",
  分叉: "价格与资金分叉",
  暂不一致: "暂未形成一致信号",
};

function Row({ row }: { row: SegmentFundRow }) {
  return (
    <div className="grid grid-cols-2 gap-x-3 gap-y-2 border-t border-gray-100 py-3 first:border-t-0 sm:grid-cols-[minmax(0,1.45fr)_0.8fr_0.9fr_1.25fr] sm:items-center sm:gap-3">
      <div className="col-span-2 min-w-0 sm:col-span-1">
        <div className="flex items-center gap-2">
          <span className="truncate text-sm font-medium text-gray-900">{row.segment}</span>
          <span className="shrink-0 rounded bg-gray-100 px-1.5 py-0.5 text-[11px] text-gray-500">
            {row.state}
          </span>
        </div>
        <p className="mt-0.5 truncate text-xs text-gray-400" title={row.plain}>
          {row.plain} · 覆盖 {row.covered}/{row.memberCount} 只
        </p>
      </div>

      <div className="flex items-baseline justify-between sm:block">
        <span className="text-xs text-gray-400 sm:hidden">资金强度</span>
        <div>
          <span className={`font-mono text-sm font-semibold ${changeClass(row.strengthPct)}`}>
            {fmtSigned(row.strengthPct)}%
          </span>
          <p className="mt-0.5 text-[11px] text-gray-400">
            主力 {fmtSigned(row.netMfYi)}亿 / 成交 {row.amountYi.toFixed(1)}亿
          </p>
        </div>
      </div>

      <div className="flex items-baseline justify-between sm:block">
        <span className="text-xs text-gray-400 sm:hidden">价格关系</span>
        <div>
          <span className="text-xs font-medium text-gray-600">
            {relationCopy[row.relation]}
          </span>
          <p className="mt-0.5 text-[11px] text-gray-400">
            链内成交额加权涨跌 {fmtSigned(row.avgPct)}%
          </p>
        </div>
      </div>

      <div className="col-span-2 flex items-baseline justify-between gap-4 sm:col-span-1 sm:block">
        <span className="shrink-0 text-xs text-gray-400 sm:hidden">下一验证</span>
        <p className="text-right text-xs leading-relaxed text-gray-500 sm:text-left">
          {row.verify.join(" / ")}
        </p>
      </div>
    </div>
  );
}

export function SegmentFundStatus({
  initial,
}: {
  initial?: SegmentFundStatusData | null;
}) {
  const [data, setData] = useState<SegmentFundStatusData | null>(initial ?? null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let active = true;
    fetch("/api/segment-fund-status", { cache: "no-store" })
      .then((r) => {
        if (!r.ok) throw new Error("request failed");
        return r.json();
      })
      .then((value) => {
        if (active && value?.rows?.length) setData(value);
      })
      .catch(() => active && !initial?.rows?.length && setFailed(true));
    return () => {
      active = false;
    };
  }, [initial]);

  if (!data?.rows?.length) {
    return (
      <section className="mb-4 rounded-xl bg-white px-4 py-3 shadow-sm">
        <div className="text-sm font-semibold text-gray-800">产业链资金状态</div>
        <p className="mt-1.5 text-xs text-gray-400">
          {failed ? "资金数据暂时读取不到,稍后再来看看" : "收盘数据生成中,稍后更新"}
        </p>
      </section>
    );
  }

  return (
    <section className="mb-4 rounded-xl bg-white px-4 py-3 shadow-sm">
      <div className="flex items-start gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-sm font-semibold text-gray-800">产业链资金状态</h2>
            <span className="rounded bg-gray-100 px-1.5 py-0.5 text-[11px] text-gray-500">
              链内样本
            </span>
          </div>
          <p className="mt-1 text-xs leading-relaxed text-gray-600">{data.summary}</p>
        </div>
        {data.date && (
          <span className="ml-auto shrink-0 text-xs text-gray-400">
            {Number(data.date.slice(5, 7))}/{Number(data.date.slice(8, 10))} 收盘
          </span>
        )}
      </div>

      <details className="group mt-2 rounded-lg bg-gray-50 px-3 py-2">
        <summary className="flex cursor-pointer list-none items-center text-xs text-gray-500">
          怎么算、怎么读
          <span className="ml-auto text-gray-300 transition-transform group-open:rotate-180">⌄</span>
        </summary>
        <div className="mt-2 space-y-1 text-xs leading-relaxed text-gray-500">
          <p>{data.formula}</p>
          <p>{data.scope}。</p>
          <p>
            “同向/分叉”只比较同日价格与资金方向;资金是市场行为,不等于订单、收入等产业证据。
          </p>
        </div>
      </details>

      <div className="mt-2 hidden grid-cols-[minmax(0,1.45fr)_0.8fr_0.9fr_1.25fr] gap-3 px-0 text-[11px] text-gray-400 sm:grid">
        <span>产业环节</span>
        <span>资金强度</span>
        <span>价格关系</span>
        <span>下一验证</span>
      </div>
      <div className="mt-1 sm:hidden">
        {data.rows.slice(0, 3).map((row) => (
          <Row key={row.segment} row={row} />
        ))}
      </div>
      {data.rows.length > 3 && (
        <details className="group border-t border-gray-100 sm:hidden">
          <summary className="flex cursor-pointer list-none items-center py-2.5 text-xs text-gray-500">
            展开其余 {data.rows.length - 3} 个环节
            <span className="ml-auto text-gray-300 transition-transform group-open:rotate-180">⌄</span>
          </summary>
          <div>
            {data.rows.slice(3).map((row) => (
              <Row key={row.segment} row={row} />
            ))}
          </div>
        </details>
      )}
      <div className="mt-1 hidden sm:block">
        {data.rows.map((row) => (
          <Row key={row.segment} row={row} />
        ))}
      </div>

      <div className="mt-1 flex flex-wrap items-center justify-between gap-2 border-t border-gray-100 pt-3">
        <p className="text-[11px] leading-relaxed text-gray-400">
          研究框架梳理·非确认,不构成投资建议。
        </p>
        <Link href="/chain/ai" className="text-xs font-medium text-brand-600 hover:underline">
          看完整产业链 →
        </Link>
      </div>
    </section>
  );
}
