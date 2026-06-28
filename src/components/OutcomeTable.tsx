"use client";

// 战绩明细表(实盘/回测复用)。长列表渐进加载:初始一截,滚到底再加载更多。
import Link from "next/link";
import type { OutcomeRow } from "@/lib/outcomes";
import type { Impact } from "@/lib/briefings";
import { changeClass, fmtChange } from "@/lib/format";
import { IMPACT_META } from "@/lib/impact";
import { Th, Td } from "@/components/Table";
import { useProgressive } from "@/components/useProgressive";

export function OutcomeTable({ rows }: { rows: OutcomeRow[] }) {
  const mob = useProgressive(rows, 12);
  const desk = useProgressive(rows, 20);

  return (
    <>
      {/* 手机:卡片(桌面隐藏) */}
      <div className="space-y-2 sm:hidden">
        {mob.slice.map((r) => (
          <OutcomeCard key={r.id} r={r} />
        ))}
        {mob.hasMore && (
          <div
            ref={mob.setSentinel}
            className="py-3 text-center text-xs text-gray-400"
          >
            下拉加载更多 · {mob.shownCount}/{mob.total}
          </div>
        )}
      </div>

      {/* 桌面:表格(手机隐藏) */}
      <div className="hidden overflow-hidden rounded-xl border border-gray-200 bg-white sm:block">
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200 bg-gray-50 text-left text-xs text-gray-500">
                <Th>日期</Th>
                <Th>简报</Th>
                <Th>受益股</Th>
                <Th className="text-center">期待</Th>
                <Th className="text-right">实际</Th>
                <Th className="text-center">结果</Th>
              </tr>
            </thead>
            <tbody>
              {desk.slice.map((r) => (
                <tr key={r.id} className="border-b border-gray-100 last:border-0">
                  <Td className="whitespace-nowrap font-mono text-xs text-gray-500">
                    {r.date.slice(5)}
                  </Td>
                  <Td className="max-w-[220px] text-xs text-gray-700">
                    <span className="mr-1">
                      {IMPACT_META[r.impact as Impact]?.emoji ?? ""}
                    </span>
                    {r.title}
                  </Td>
                  <Td className="whitespace-nowrap">
                    <Link
                      href={`/stock/${r.code}`}
                      className="font-medium text-gray-900 hover:text-blue-600"
                    >
                      {r.name}
                    </Link>
                  </Td>
                  <Td className="text-center text-xs text-gray-500">
                    {r.expected}
                  </Td>
                  <Td className="text-right font-mono tabular-nums">
                    {r.change === null ? (
                      <span className="text-gray-300">—</span>
                    ) : (
                      <span className={changeClass(r.change)}>
                        {fmtChange(r.change)}
                      </span>
                    )}
                  </Td>
                  <Td className="text-center">
                    {r.hit === null ? (
                      <span className="text-xs text-gray-300">未判定</span>
                    ) : r.hit ? (
                      <span className="text-xs font-medium text-rose-600">
                        跟上 ✓
                      </span>
                    ) : (
                      <span className="text-xs text-gray-400">没跟上</span>
                    )}
                  </Td>
                </tr>
              ))}
              {desk.hasMore && (
                <tr ref={desk.setSentinel}>
                  <td
                    colSpan={6}
                    className="py-3 text-center text-xs text-gray-400"
                  >
                    下拉加载更多 · {desk.shownCount}/{desk.total}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}

function OutcomeCard({ r }: { r: OutcomeRow }) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-3">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 text-sm text-gray-800">
          <span className="mr-1">
            {IMPACT_META[r.impact as Impact]?.emoji ?? ""}
          </span>
          {r.title}
        </div>
        <span className="shrink-0 font-mono text-xs text-gray-400">
          {r.date.slice(5)}
        </span>
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-gray-500">
        <Link
          href={`/stock/${r.code}`}
          className="font-medium text-gray-900 hover:text-blue-600"
        >
          {r.name}
        </Link>
        <span>期待{r.expected}</span>
        <span className="text-gray-300">·</span>
        <span className="inline-flex items-center gap-1">
          实际
          {r.change === null ? (
            <span className="text-gray-300">—</span>
          ) : (
            <span className={`font-mono ${changeClass(r.change)}`}>
              {fmtChange(r.change)}
            </span>
          )}
        </span>
        <span className="text-gray-300">·</span>
        {r.hit === null ? (
          <span className="text-gray-300">未判定</span>
        ) : r.hit ? (
          <span className="font-medium text-rose-600">跟上 ✓</span>
        ) : (
          <span className="text-gray-400">没跟上</span>
        )}
      </div>
    </div>
  );
}
