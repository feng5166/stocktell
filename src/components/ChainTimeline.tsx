// 链逻辑时间轴(2.2.4,server component):事件→资金意图→专篇→复盘,按日纵向排布。
import Link from "next/link";
import type { ChainTimelineEntry } from "@/lib/chain-timeline";

const DOT_CLS: Record<ChainTimelineEntry["kind"], string> = {
  event: "bg-brand-500",
  "evt-doc": "bg-brand-300",
  intent: "bg-indigo-400",
  outcome: "bg-gray-300",
};

const fmtDate = (iso: string) => `${Number(iso.slice(5, 7))}/${Number(iso.slice(8, 10))}`;

export function ChainTimeline({ entries }: { entries: ChainTimelineEntry[] }) {
  if (entries.length === 0) return null;
  // 按日分组保持传入顺序
  const byDate: { date: string; rows: ChainTimelineEntry[] }[] = [];
  for (const e of entries) {
    const last = byDate[byDate.length - 1];
    if (last && last.date === e.date) last.rows.push(e);
    else byDate.push({ date: e.date, rows: [e] });
  }
  return (
    <ol className="mt-3 space-y-3 border-l border-gray-200 pl-4">
      {byDate.map((g) => (
        <li key={g.date} className="relative">
          <span className="absolute -left-[21px] top-1.5 h-2 w-2 rounded-full bg-gray-300" />
          <div className="text-xs font-medium text-gray-400">{fmtDate(g.date)}</div>
          <div className="mt-0.5 space-y-1">
            {g.rows.map((e, i) => (
              <div key={i} className="flex items-start gap-1.5 text-sm leading-relaxed text-gray-800">
                <span className={`mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full ${DOT_CLS[e.kind]}`} />
                {e.href ? (
                  <Link href={e.href} className="hover:text-brand-600 hover:underline">
                    {e.text}
                  </Link>
                ) : (
                  <span>{e.text}</span>
                )}
              </div>
            ))}
          </div>
        </li>
      ))}
    </ol>
  );
}
