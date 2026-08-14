// 「StockTell 今天怎么看」(三轮走查 2026-08-14:保留紫色强调但高度压缩,
// 总判断 ≤2 行,底部改 3 个短标签——像 Tell,不像 Banner)。
import { fmtYmd } from "@/lib/market-intent/ui";
import type { DailyTell as TellData } from "@/lib/judgment-diff";

function Tag({ k, v, title }: { k: string; v: string; title?: string }) {
  return (
    <span
      title={title}
      className="inline-flex items-center gap-1 rounded-full bg-white/15 px-2.5 py-0.5 text-xs"
    >
      <span className="text-brand-200">{k}</span>
      <span className="font-medium">{v}</span>
    </span>
  );
}

export function DailyTell({ ymd, tell }: { ymd: string; tell: TellData }) {
  return (
    <section className="mt-4 rounded-2xl bg-brand-600 px-5 py-4 text-white shadow-sm">
      <div className="flex items-baseline justify-between gap-2">
        <h2 className="text-xs font-medium text-brand-200">StockTell 今天怎么看</h2>
        <span className="text-meta text-brand-200">{fmtYmd(ymd)} 盘后 · 规则合成</span>
      </div>
      <p className="mt-1.5 line-clamp-2 text-[15px] font-semibold leading-snug sm:text-base">
        {tell.sentence}
      </p>
      <div className="mt-2.5 flex flex-wrap gap-2">
        <Tag k="最值得看" v={tell.best} />
        {tell.biggestChange && <Tag k="最大变化" v={tell.biggestChange} />}
        {!tell.biggestChange && <Tag k="最大变化" v="与昨日一致" />}
        {tell.biggestRisk && <Tag k="最大风险" v={tell.biggestRisk} />}
      </div>
    </section>
  );
}
