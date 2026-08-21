import { explainRiskEvent, type RiskEventForExplain } from "@/lib/risk-event-explain";

const LEVEL_CLASS = {
  风险提醒: "bg-rose-50 text-rose-600",
  重点关注: "bg-amber-50 text-amber-700",
  重要事项: "bg-gray-100 text-gray-600",
} as const;

export function RiskEventItem({
  event,
  compact = false,
}: {
  event: RiskEventForExplain;
  compact?: boolean;
}) {
  const take = explainRiskEvent(event);
  const eventDate = event.date ? event.date.slice(5) : null;

  return (
    <li className={compact ? "rounded-lg bg-gray-50/80 px-3 py-2.5" : "rounded-lg border border-gray-100 px-3.5 py-3"}>
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <span className="text-sm font-medium text-gray-800">{event.text}</span>
        <span className={`rounded px-1.5 py-0.5 text-meta font-medium ${LEVEL_CLASS[take.level]}`}>
          {take.level}
        </span>
        {eventDate && <span className="text-meta text-gray-400">公告日 {eventDate}</span>}
      </div>

      <details className="group mt-2">
        <summary className="cursor-pointer list-none text-xs font-medium text-brand-600 hover:text-brand-700 [&::-webkit-details-marker]:hidden">
          <span className="inline-flex items-center gap-1">
            StockTell 解读
            <span className="text-[10px] transition-transform group-open:rotate-90">→</span>
          </span>
        </summary>
        <div className="mt-2 space-y-1.5 border-l-2 border-gray-200 pl-3 text-xs leading-relaxed text-gray-600">
          <p className="font-medium text-gray-800">{take.conclusion}</p>
          <p>
            <span className="text-gray-400">为什么列入：</span>
            {take.why}
          </p>
          <p>
            <span className="text-gray-400">接下来验证：</span>
            {take.verify}
          </p>
        </div>
      </details>
    </li>
  );
}
