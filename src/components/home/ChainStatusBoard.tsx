// 各链今日状态·摘要仪表盘(2026-07-08 首页改版 §4):替代"普通列表感"的链状态模块,
// 每链一张小卡 = 状态方向 + 今日触发 + 直接映射数 + 待验证数,让用户三秒看懂"今天哪条链在动"。
// 服务端纯 props(page.tsx 由 cards + 静态关系库组装,零额外请求);移动端横滑(snap),桌面网格。
import Link from "next/link";

export interface ChainStatusRow {
  chainId: string;
  name: string; // 短名
  status: string; // 升温/降温/分化/观察(今日 daily 热力主方向;无 daily=观察)
  triggered: number; // 今日触发事件数(触发源归链)
  direct: number; // 直接映射标的数(静态关系库)
  pending: number; // 待验证档标的数(静态关系库)
}

// 状态用 emoji+中性底色表达方向,不占用红色(红只留合规/异常)
const STATUS_UI: Record<string, { emoji: string; cls: string }> = {
  升温: { emoji: "🔥", cls: "bg-orange-50 text-orange-700" },
  降温: { emoji: "🧊", cls: "bg-sky-50 text-sky-700" },
  分化: { emoji: "🌡️", cls: "bg-amber-50 text-amber-700" },
  观察: { emoji: "👀", cls: "bg-gray-100 text-gray-500" },
};

export function ChainStatusBoard({ rows, date }: { rows: ChainStatusRow[]; date: string }) {
  if (rows.length === 0) return null;
  return (
    <section className="mt-8">
      <div className="flex items-baseline justify-between">
        <h2 className="text-h2 font-semibold text-gray-900">各链今日状态</h2>
        <span className="text-xs text-gray-400">{date} · 方向=产业热力,非涨跌预测</span>
      </div>
      {/* 移动端横滑、桌面网格:一屏之内看完全部链 */}
      <div className="mt-3 flex snap-x gap-3 overflow-x-auto pb-1 sm:grid sm:snap-none sm:overflow-visible sm:pb-0 sm:[grid-template-columns:repeat(auto-fit,minmax(11rem,1fr))]">
        {rows.map((r) => {
          const ui = STATUS_UI[r.status] ?? STATUS_UI["观察"];
          return (
            <Link
              key={r.chainId}
              href={`/chain/${r.chainId}`}
              className="block w-44 shrink-0 snap-start rounded-xl bg-white p-3.5 shadow-sm transition-shadow hover:shadow sm:w-auto"
            >
              <div className="text-[13px] font-semibold leading-snug text-gray-800">{r.name}</div>
              <div className="mt-2">
                <span className={`rounded px-1.5 py-0.5 text-[11px] font-medium ${ui.cls}`}>
                  {ui.emoji} {r.status}
                </span>
              </div>
              <dl className="mt-2.5 space-y-1 text-xs">
                <div className="flex justify-between">
                  <dt className="text-gray-400">今日触发</dt>
                  <dd className="font-medium tabular-nums text-gray-700">{r.triggered}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-gray-400">直接映射</dt>
                  <dd className="font-medium tabular-nums text-gray-700">{r.direct}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-gray-400">待验证</dt>
                  <dd className="font-medium tabular-nums text-gray-700">{r.pending}</dd>
                </div>
              </dl>
            </Link>
          );
        })}
      </div>
    </section>
  );
}
