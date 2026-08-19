// 「今日发生了什么」(首页阅读路径改版 2026-08-14,server component)。
// 负责人:首页的职责是告诉你哪些值得点,不是把详情页搬上来——只放 3 条,
// 每条=事件+影响链+一句话传导+查看推理;完整拆解在事件专篇/因果链深读。
import Link from "next/link";
import type { BriefingItem } from "@/lib/briefings";

export function EventTop3({
  items,
  evtMap,
  chainName,
  insightHref,
}: {
  items: BriefingItem[];
  evtMap: Record<string, string>;
  chainName?: string;
  insightHref?: string | null;
}) {
  const top = items.slice(0, 3);
  if (top.length === 0) return null;
  // retailTake 是「**这次变了啥**:…」结构化 markdown——索引卡只要第一段人话,
  // 剥掉星号与段落标签(三轮走查:原始 ** 直接露出=事故级观感)
  const firstClause = (s: string) => {
    const plain = s.replace(/\*\*/g, "");
    const m = plain.match(/这次变了啥[::]\s*([^。\n]+)/);
    const cut = (m ? m[1] : plain.split(/[。\n;;]/)[0] ?? plain).trim();
    return cut.length > 42 ? cut.slice(0, 42) + "…" : cut;
  };
  return (
    <section className="mt-8">
      <div className="flex items-baseline justify-between">
        <h2 className="text-h2 font-semibold text-gray-900">今日发生了什么</h2>
        <span className="text-meta text-gray-400">完整拆解在下方事件区与专篇</span>
      </div>
      {/* 二级卡:轻边框无 shadow,等高;每卡=类型+影响链+标题+一句话+看传导(不塞正文)。
          chip 收敛:事件类型中性灰,影响链浅紫(一卡一主色) */}
      <div className="mt-3 grid gap-3 md:grid-cols-3">
        {top.map((it) => {
          const href = evtMap[it.id] ?? insightHref ?? "#feed";
          return (
            <Link
              key={it.id}
              href={href}
              className="flex flex-col rounded-xl border border-gray-200 bg-white p-4 transition-shadow hover:shadow-sm"
            >
              <div className="flex flex-wrap items-center gap-1.5">
                {it.triggerCode && (
                  <span className="inline-flex rounded bg-gray-100 px-1.5 py-0.5 text-meta font-medium text-gray-500">
                    链级触发
                  </span>
                )}
                {chainName && (
                  <span className="inline-flex rounded bg-brand-50 px-1.5 py-0.5 text-meta font-medium text-brand-700">
                    {chainName}
                  </span>
                )}
              </div>
              <p className="mt-2 line-clamp-2 text-[15px] font-medium leading-[1.5] text-gray-900">{it.title}</p>
              <p className="mt-1.5 line-clamp-2 flex-1 text-[13px] leading-[1.75] text-gray-600">{firstClause(it.retailTake)}</p>
              <span className="mt-2.5 text-right text-[13px] font-medium text-brand-600">看传导 →</span>
            </Link>
          );
        })}
      </div>
    </section>
  );
}
