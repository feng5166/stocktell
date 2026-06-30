"use client";

// 战绩明细(实盘/回测复用)。按「简报」分组:一条简报喊多只受益股,标题只显示一次作组头,
// 下面挂紧凑的个股小行(名称·期待·实际·结果)。消除原扁平表里简报标题被重复 N 遍的问题。
import Link from "next/link";
import type { OutcomeRow } from "@/lib/outcomes";
import type { Impact } from "@/lib/briefings";
import { changeClass, fmtChange } from "@/lib/format";
import { IMPACT_META } from "@/lib/impact";

interface Group {
  key: string;
  date: string;
  title: string;
  impact: string;
  rows: OutcomeRow[];
  hits: number;
  evaluated: number;
}

// 按出现顺序(已按日期降序)把相邻同简报的行聚到一组。跨分页累积时重新聚合会自动愈合。
function groupByBriefing(rows: OutcomeRow[]): Group[] {
  const out: Group[] = [];
  const idx = new Map<string, Group>();
  for (const r of rows) {
    const key = `${r.date}|${r.impact}|${r.title}`;
    let g = idx.get(key);
    if (!g) {
      g = { key, date: r.date, title: r.title, impact: r.impact, rows: [], hits: 0, evaluated: 0 };
      idx.set(key, g);
      out.push(g);
    }
    g.rows.push(r);
    if (r.hit !== null) {
      g.evaluated += 1;
      if (r.hit) g.hits += 1;
    }
  }
  return out;
}

export function OutcomeTable({ rows }: { rows: OutcomeRow[] }) {
  const groups = groupByBriefing(rows);
  return (
    <div className="space-y-3">
      {groups.map((g) => (
        <div key={g.key} className="overflow-hidden rounded-xl bg-white shadow-sm">
          {/* 组头:简报标题只出现一次 + 日期 + 跟上小结 */}
          <div className="flex items-start gap-2 border-b border-gray-100 bg-gray-50/70 px-3 py-2">
            <span className="mt-0.5 shrink-0 text-sm leading-none">
              {IMPACT_META[g.impact as Impact]?.emoji ?? ""}
            </span>
            <p className="min-w-0 flex-1 text-xs font-medium leading-snug text-gray-700">
              {g.title}
            </p>
            <span className="shrink-0 font-mono text-[11px] leading-5 text-gray-400">
              {g.date.slice(5)}
            </span>
            {g.evaluated > 0 && (
              <span
                className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium leading-4 ${
                  g.hits * 2 >= g.evaluated
                    ? "bg-rose-50 text-rose-600"
                    : "bg-gray-100 text-gray-500"
                }`}
              >
                有效 {g.hits}/{g.evaluated}
              </span>
            )}
          </div>

          {/* 受益股小行:名称 · 期待 · 实际 · 结果 */}
          <div className="divide-y divide-gray-50">
            {g.rows.map((r) => (
              <div key={r.id} className="flex items-center gap-2 px-3 py-2 text-sm">
                <Link
                  href={`/stock/${r.code}`}
                  className="min-w-0 flex-1 truncate font-medium text-gray-900 hover:text-brand-600"
                >
                  {r.name}
                </Link>
                <span className="shrink-0 text-xs text-gray-400">期待{r.expected}</span>
                <span className="w-16 shrink-0 text-right font-mono tabular-nums">
                  {r.change === null ? (
                    <span className="text-gray-300">—</span>
                  ) : (
                    <span className={changeClass(r.change)}>{fmtChange(r.change)}</span>
                  )}
                </span>
                <span className="w-16 shrink-0 text-right text-xs">
                  {r.hit === null ? (
                    <span className="text-gray-300">未判定</span>
                  ) : r.hit ? (
                    <span className="font-medium text-rose-600">有效 ✓</span>
                  ) : (
                    <span className="text-gray-400">未联动</span>
                  )}
                </span>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
