// 单板块资金意图卡(2.2.3,server component)。展示铁律:结论 → 证据 → 反证 → 失效条件。
import type { SegmentIntentSnapshot } from "@/lib/market-intent/types";
import { CONFIDENCE_LABEL, INTENT_CHIP_CLS, fmtYi } from "@/lib/market-intent/ui";

export default function MarketIntentCard({
  snap,
  segmentName,
}: {
  snap: SegmentIntentSnapshot;
  segmentName: string;
}) {
  const { metrics: m, intent: i } = snap;
  return (
    <div className="rounded-xl border border-gray-200 bg-white px-4 py-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm font-semibold text-gray-900">{segmentName}</span>
        <span
          className={`inline-flex rounded px-1.5 py-0.5 text-meta font-medium ${INTENT_CHIP_CLS[i.intent]}`}
        >
          {i.label} · {CONFIDENCE_LABEL[i.confidence]}
        </span>
      </div>
      {i.evidence.length > 0 && (
        <ul className="mt-2 space-y-1 text-sm leading-relaxed text-gray-800">
          {i.evidence.map((e, idx) => (
            <li key={idx} className="flex gap-1.5">
              <span className="shrink-0 text-gray-300">·</span>
              <span>{e}</span>
            </li>
          ))}
        </ul>
      )}
      {i.counterEvidence.length > 0 && (
        <p className="mt-2 text-xs leading-relaxed text-gray-500">
          <span className="font-medium text-gray-600">反证:</span>
          {i.counterEvidence.join(";")}
        </p>
      )}
      {i.invalidation.length > 0 && (
        <p className="mt-1 text-xs leading-relaxed text-gray-500">
          <span className="font-medium text-gray-600">失效条件:</span>
          {i.invalidation.join(";")}
        </p>
      )}
      <p className="mt-2 border-t border-gray-100 pt-2 text-meta text-gray-400">
        今日主力 {fmtYi(m.mainNetYi)}
        {m.retailNetYi !== null && <> · 散户 {fmtYi(m.retailNetYi)}</>}
        {m.mainNet3dYi !== null && <> · 近3日 {fmtYi(m.mainNet3dYi)}</>}
        {m.mainNet5dYi !== null && <> · 近5日 {fmtYi(m.mainNet5dYi)}</>}
        {m.amountPctl20 !== null && <> · 成交20日分位 {m.amountPctl20}</>}
      </p>
    </div>
  );
}
