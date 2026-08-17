// 「StockTell 今天怎么看」(首页视觉优化 2026-08-16:撤掉大面积品牌色块——
// 总判断本身就是重点,不靠颜色抢眼。白卡 + 左侧 3px 紫色竖线 + 浅紫「今日判断」标签,
// 正文深色(#202431),下面三个小摘要 chip;整卡只允许品牌紫一个主色)。
import { fmtYmd } from "@/lib/market-intent/ui";
import type { DailyTell as TellData } from "@/lib/judgment-diff";

// 摘要 chip:中性底 + 灰 key + 深色值;仅「最值得看」用浅紫强调(一卡一主色)
function Tag({ k, v, accent, title }: { k: string; v: string; accent?: boolean; title?: string }) {
  return (
    <span
      title={title}
      className={`inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs ${
        accent ? "bg-brand-50 text-brand-800" : "bg-gray-50 text-gray-700"
      }`}
    >
      <span className={accent ? "text-brand-600" : "text-gray-400"}>{k}</span>
      <span className="font-medium">{v}</span>
    </span>
  );
}

export function DailyTell({ ymd, tell }: { ymd: string; tell: TellData }) {
  return (
    <section className="relative mt-4 overflow-hidden rounded-xl border border-gray-200/70 bg-white px-5 py-4 shadow-sm">
      <span aria-hidden className="absolute inset-y-0 left-0 w-[3px] bg-brand-600" />
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="inline-flex items-center rounded bg-brand-50 px-2 py-0.5 text-xs font-medium text-brand-700">
            今日判断
          </span>
          <h2 className="text-xs font-medium text-gray-500">StockTell 今天怎么看</h2>
        </div>
        <span className="text-meta text-gray-400">{fmtYmd(ymd)} 盘后 · 规则合成</span>
      </div>
      <p className="mt-2 line-clamp-2 text-[15px] font-semibold leading-snug text-[#202431] sm:text-base">
        {tell.sentence}
      </p>
      <div className="mt-2.5 flex flex-wrap gap-2">
        <Tag k="最值得看" v={tell.best} accent />
        {tell.biggestChange && <Tag k="最大变化" v={tell.biggestChange} />}
        {!tell.biggestChange && <Tag k="最大变化" v="与昨日一致" />}
        {tell.biggestRisk && <Tag k="最大风险" v={tell.biggestRisk} />}
      </div>
    </section>
  );
}
