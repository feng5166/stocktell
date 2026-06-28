import Link from "next/link";
import { notFound } from "next/navigation";
import { STOCK_MAP, resolvePeer, type Stock } from "@/data/stocks";
import { ChainPosition } from "@/components/ChainPosition";
import { chainNeighbors } from "@/data/chainEdges";
import { edgeInfo, STRENGTH_BADGE } from "@/data/relations";
import { fetchQuotes } from "@/lib/quotes";
import { readQuotesCache } from "@/lib/quotes-cache";
import { listBriefing } from "@/lib/briefings";
import { WatchStar } from "@/components/WatchStar";
import { Fundamentals } from "@/components/Fundamentals";
import { Similarity } from "@/components/Similarity";
import { StockTellTake } from "@/components/StockTellTake";
import { todayISO } from "@/lib/date";

export const dynamic = "force-dynamic";

export default async function StockDetail({
  params,
}: {
  params: { code: string };
}) {
  const s = STOCK_MAP[params.code];
  if (!s) notFound();

  // 拉实时行情;拿不到读缓存(上次真实行情)并标注"截至几号";都没有才显示休市
  let q = (await fetchQuotes([s.code])).quotes[s.code];
  let stale = false;
  let quotesAsOf: string | null = null;
  if (!q) {
    const cache = await readQuotesCache();
    const cq = cache?.quotes[s.code];
    if (cq) {
      q = cq;
      stale = true;
      quotesAsOf = cache!.asOf;
    }
  }
  const hasData = Boolean(q);
  const price = q?.price ?? null;
  const change = q?.change ?? null;

  // 今天的简报里是否提到这只(真实"今日有新消息")
  const todayNews = (
    await listBriefing({ date: todayISO(), status: "published" }).catch(() => [])
  ).filter(
    (it) => it.triggerCode === s.code || it.beneficiaries.some((b) => b.code === s.code)
  );

  // 真实「散户怎么想」:优先取今天提到这只票的简报条目(retailTake 真实、可深读);没有则退回静态文案
  const newsItem =
    todayNews.find((it) => it.triggerCode === s.code) ?? todayNews[0] ?? null;

  // 统一关联邻居 = 既有 relations(美股用 code、A股用名称)+ 产业链真实关联边
  // (chainEdges,双向、含 A股↔A股/美股↔美股),按代码去重。
  const peerMap = new Map<string, Stock>();
  const otherTokens: string[] = [];
  for (const t of s.relations) {
    const p = resolvePeer(t);
    if (!p) {
      otherTokens.push(t);
      continue;
    }
    if (p.code !== s.code) peerMap.set(p.code, p);
  }
  for (const n of chainNeighbors(s.code)) {
    const p = STOCK_MAP[n.code];
    if (p && p.code !== s.code) peerMap.set(p.code, p);
  }
  const peers = Array.from(peerMap.values());

  // 按关联强度降序(edgeInfo 现已覆盖产业链边)
  const STR_RANK: Record<string, number> = { 强: 3, 中: 2, 弱: 1 };
  const strengthOf = (code: string) =>
    STR_RANK[edgeInfo(s.code, code)?.strength ?? "弱"] ?? 0;
  const byStrength = (arr: Stock[]) =>
    [...arr].sort((a, b) => strengthOf(b.code) - strengthOf(a.code));

  const usPeers = byStrength(peers.filter((p) => p.market === "美股")).map(
    (p) => ({ token: p.code, peer: p })
  );
  const aPeers = byStrength(peers.filter((p) => p.market === "A股")).map(
    (p) => ({ token: p.code, peer: p })
  );
  const otherPeers = otherTokens.map((t) => ({ token: t, peer: null as Stock | null }));

  // 产业链上下游导航:按边的真实方向分(up=供货给本股的上游;down=采购本股的下游),
  // 而非按全局位置——否则同为「上游」的供应商会落进「你在这」被隐藏。已按强度降序。
  const upPeers: { code: string; name: string; market: string }[] = [];
  const downPeers: { code: string; name: string; market: string }[] = [];
  for (const n of chainNeighbors(s.code)) {
    const p = STOCK_MAP[n.code];
    if (!p) continue;
    const item = { code: p.code, name: p.name, market: p.market };
    (n.dir === "up" ? upPeers : downPeers).push(item);
  }

  return (
    <div className="min-h-screen bg-canvas text-ink">
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
                ? "bg-brand-50 text-brand-600"
                : "bg-red-50 text-red-600"
            }`}
          >
            {s.market}
          </span>
          <WatchStar code={s.code} />
          {hasData ? (
            <span
              className={`ml-auto font-mono text-lg font-semibold tabular-nums ${
                change! > 0
                  ? "text-rose-600"
                  : change! < 0
                  ? "text-emerald-600"
                  : "text-gray-400"
              }`}
            >
              {price!.toFixed(2)}{" "}
              <span className="text-sm">
                {change! > 0 ? "+" : ""}
                {change!.toFixed(2)}%
              </span>
              {stale && quotesAsOf && (
                <span className="ml-1 text-xs font-normal text-gray-400">
                  · 截至{" "}
                  {new Intl.DateTimeFormat("zh-CN", {
                    timeZone: "Asia/Shanghai",
                    month: "numeric",
                    day: "numeric",
                    hour: "2-digit",
                    minute: "2-digit",
                  }).format(new Date(quotesAsOf))}
                </span>
              )}
            </span>
          ) : (
            <span className="ml-auto text-sm text-gray-400">休市 / 行情未连接</span>
          )}
        </div>

        <Section title="它是干什么的">
          <p className="text-[15px] leading-relaxed text-gray-800">
            {s.positioning}
          </p>
        </Section>

        <Fundamentals code={s.code} market={s.market} />

        <Section title="对应的股票">
          {usPeers.length === 0 &&
          aPeers.length === 0 &&
          otherPeers.length === 0 ? (
            <p className="text-sm text-gray-400">暂无关联标的</p>
          ) : (
            <div className="space-y-3 text-sm">
              {usPeers.length > 0 && (
                <PeerGroup label="对应美股" anchor={s} items={usPeers} />
              )}
              {aPeers.length > 0 && (
                <PeerGroup label="对应 A 股" anchor={s} items={aPeers} />
              )}
              {otherPeers.length > 0 && (
                <PeerGroup label="相关" items={otherPeers} />
              )}
            </div>
          )}
          {(usPeers.length > 0 || aPeers.length > 0) && (
            <p className="mt-3 text-[11px] leading-relaxed text-gray-400">
              强 = 有明确供货/直接业务绑定;中 = 对标/国产替代(无直接供货);弱 =
              同主题、蹭概念。关系为研究框架梳理,非确认的客户/供应商关系。
            </p>
          )}
        </Section>

        <Section title="在产业链的位置">
          <ChainPosition
            pos={s.position}
            sector={s.sector}
            up={upPeers}
            down={downPeers}
          />
        </Section>

        {s.market === "A股" && <Similarity code={s.code} />}

        <Section title="最近发生了什么">
          <ul className="space-y-1.5 text-sm text-gray-700">
            {todayNews.map((it) => (
              <li key={it.id} className="text-rose-600">
                • 今日简报:{it.title}
              </li>
            ))}
            <li>• {s.observation}</li>
          </ul>
        </Section>

        <Section title="散户怎么想" highlight>
          {newsItem ? (
            <StockTellTake itemId={newsItem.id} retailTake={newsItem.retailTake} />
          ) : (
            <p className="text-[15px] leading-relaxed text-gray-800">
              {s.retailTake}
              <span className="mt-1 block text-xs text-gray-400">
                今日暂无相关动态,以上为该标的的长期定位参考。
              </span>
            </p>
          )}
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

function PeerGroup({
  label,
  anchor,
  items,
}: {
  label: string;
  anchor?: Stock;
  items: { token: string; peer: Stock | null }[];
}) {
  const CAP = 12; // 龙头(如英伟达)关联众多,封顶展示强关联,其余折叠计数
  const shownItems = items.slice(0, CAP);
  const hidden = items.length - shownItems.length;
  return (
    <div>
      <div className="mb-1.5 text-xs text-gray-400">{label}</div>
      <div className="space-y-1.5">
        {shownItems.map(({ token, peer }) => {
          const info = anchor && peer ? edgeInfo(anchor.code, peer.code) : null;
          return (
            <div
              key={peer?.code ?? token}
              className="flex flex-wrap items-center gap-2"
            >
              {info && (
                <span
                  className={`inline-flex shrink-0 rounded px-1.5 py-0.5 text-[11px] ring-1 ring-inset ${STRENGTH_BADGE[info.strength]}`}
                >
                  {info.strength}关联
                </span>
              )}
              {peer ? (
                <Link
                  href={`/stock/${peer.code}`}
                  className="font-medium text-gray-800 hover:text-brand-600"
                >
                  {peer.name}
                </Link>
              ) : (
                <span className="text-gray-600">{token}</span>
              )}
              {info && (
                <span className="text-xs text-gray-400">· {info.basis}</span>
              )}
            </div>
          );
        })}
        {hidden > 0 && (
          <div className="text-xs text-gray-400">…另有 {hidden} 只关联标的</div>
        )}
      </div>
    </div>
  );
}
