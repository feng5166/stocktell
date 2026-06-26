import Link from "next/link";
import { notFound } from "next/navigation";
import { STOCK_MAP, type Position } from "@/data/stocks";
import { fetchQuotes } from "@/lib/quotes";

export const dynamic = "force-dynamic";

const CHAIN: Position[] = ["上游", "中游", "下游"];

export default async function StockDetail({
  params,
}: {
  params: { code: string };
}) {
  const s = STOCK_MAP[params.code];
  if (!s) notFound();

  // 拉实时行情,拿不到回退种子价
  const q = (await fetchQuotes([s.code])).quotes[s.code];
  const price = q?.price ?? s.price;
  const change = q?.change ?? s.change;

  const usPeers = s.relations.filter((r) => STOCK_MAP[r]?.market === "美股");
  const aPeers = s.relations.filter((r) => STOCK_MAP[r]?.market === "A股");
  const otherPeers = s.relations.filter((r) => !STOCK_MAP[r]);

  return (
    <div className="min-h-screen bg-[#f7f8fa] text-[#1a1d24]">
      <header className="border-b border-gray-200 bg-white">
        <div className="mx-auto flex max-w-3xl items-center justify-between px-4 py-3 sm:px-6">
          <Link href="/" className="text-lg font-bold tracking-tight">
            StockTell
          </Link>
          <Link href="/stocks" className="text-sm text-gray-500 hover:text-gray-900">
            ← 返回股票池
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-4 py-6 sm:px-6">
        {/* 标题 */}
        <div className="mb-6 flex flex-wrap items-baseline gap-3">
          <h1 className="text-2xl font-semibold tracking-tight">{s.name}</h1>
          <span className="font-mono text-sm text-gray-400">{s.code}</span>
          <span
            className={`rounded px-1.5 py-0.5 text-xs ${
              s.market === "美股"
                ? "bg-blue-50 text-blue-600"
                : "bg-red-50 text-red-600"
            }`}
          >
            {s.market}
          </span>
          <span
            className={`ml-auto font-mono text-lg font-semibold tabular-nums ${
              change > 0
                ? "text-rose-600"
                : change < 0
                ? "text-emerald-600"
                : "text-gray-400"
            }`}
          >
            {price.toFixed(2)}{" "}
            <span className="text-sm">
              {change > 0 ? "+" : ""}
              {change.toFixed(2)}%
            </span>
          </span>
        </div>

        <Section title="它是干什么的">
          <p className="text-[15px] leading-relaxed text-gray-800">
            {s.positioning}
          </p>
        </Section>

        <Section title="在产业链的位置">
          <div className="flex items-center gap-2">
            {CHAIN.map((p, i) => (
              <div key={p} className="flex items-center gap-2">
                <span
                  className={`rounded-md px-3 py-1.5 text-sm ${
                    p === s.position
                      ? "bg-gray-900 font-medium text-white"
                      : "bg-gray-100 text-gray-500"
                  }`}
                >
                  {p === s.position ? `你在这 · ${p}` : p}
                </span>
                {i < CHAIN.length - 1 && (
                  <span className="text-gray-300">→</span>
                )}
              </div>
            ))}
          </div>
          <p className="mt-2 text-xs text-gray-400">板块:{s.sector}</p>
        </Section>

        <Section title="对应的股票">
          {usPeers.length === 0 &&
          aPeers.length === 0 &&
          otherPeers.length === 0 ? (
            <p className="text-sm text-gray-400">暂无关联标的</p>
          ) : (
            <div className="space-y-2 text-sm">
              {usPeers.length > 0 && (
                <PeerRow label="对应美股" peers={usPeers} />
              )}
              {aPeers.length > 0 && (
                <PeerRow label="对应 A 股" peers={aPeers} />
              )}
              {otherPeers.length > 0 && (
                <PeerRow label="相关" peers={otherPeers} plain />
              )}
            </div>
          )}
        </Section>

        <Section title="最近发生了什么">
          <ul className="space-y-1.5 text-sm text-gray-700">
            <li>• {s.observation}</li>
            {s.status === "今日有新消息" && (
              <li className="text-rose-600">• 今日有新消息,关注盘面反应</li>
            )}
          </ul>
        </Section>

        <Section title="散户怎么想" highlight>
          <p className="text-[15px] leading-relaxed text-gray-800">
            {s.retailTake}
          </p>
        </Section>

        <p className="mt-8 rounded-lg bg-gray-100 px-4 py-3 text-xs leading-relaxed text-gray-500">
          免责声明:以上内容为公开信息整理,不构成投资建议。产业链关系为研究框架梳理,非确认的客户/供应商/持仓关系。历史规律不代表未来表现。
        </p>
      </main>
    </div>
  );
}

function Section({
  title,
  children,
  highlight,
}: {
  title: string;
  children: React.ReactNode;
  highlight?: boolean;
}) {
  return (
    <section
      className={`mb-4 rounded-xl border p-4 ${
        highlight
          ? "border-amber-200 bg-amber-50"
          : "border-gray-200 bg-white"
      }`}
    >
      <h2 className="mb-2 text-xs font-medium uppercase tracking-wide text-gray-400">
        {title}
      </h2>
      {children}
    </section>
  );
}

function PeerRow({
  label,
  peers,
  plain,
}: {
  label: string;
  peers: string[];
  plain?: boolean;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="text-xs text-gray-400">{label}</span>
      {peers.map((name) => {
        const peer = STOCK_MAP[name];
        if (plain || !peer) {
          return (
            <span
              key={name}
              className="rounded bg-gray-100 px-2 py-0.5 text-xs text-gray-600"
            >
              {name}
            </span>
          );
        }
        return (
          <Link
            key={name}
            href={`/stock/${peer.code}`}
            className="rounded bg-gray-100 px-2 py-0.5 text-xs text-gray-700 hover:bg-gray-200"
          >
            {name}
          </Link>
        );
      })}
    </div>
  );
}
