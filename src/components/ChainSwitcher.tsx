"use client";

// 产业链切换器:AI 产业链(当前)+ 其他「开发中」链。
// 点开发中的链 → 展开「🚧 开发中 + 👀 我想要」投票,收集需求/反哺开发优先级。
import { useEffect, useState } from "react";
import { track } from "@/lib/analytics";

const CHAINS: { key: string; name: string; ready: boolean }[] = [
  { key: "ai", name: "AI 产业链", ready: true },
  { key: "newenergy", name: "新能源 · 光伏储能", ready: false },
  { key: "pharma", name: "创新药 · 医药", ready: false },
  { key: "semi", name: "半导体设备材料", ready: false },
  { key: "robot", name: "机器人 · 具身", ready: false },
  { key: "military", name: "军工", ready: false },
];

// 游客也能投:用 localStorage 里的匿名 id 去重(轻量防刷,需求收集为主)
function clientId(): string {
  if (typeof window === "undefined") return "";
  let id = localStorage.getItem("stocktell_cid");
  if (!id) {
    id = Math.random().toString(36).slice(2) + Date.now().toString(36);
    localStorage.setItem("stocktell_cid", id);
  }
  return id;
}

export function ChainSwitcher() {
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [voted, setVoted] = useState<Set<string>>(new Set());
  const [open, setOpen] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/chain-interest")
      .then((r) => r.json())
      .then((d) => setCounts(d.counts ?? {}))
      .catch(() => {});
    try {
      setVoted(
        new Set(JSON.parse(localStorage.getItem("stocktell_chain_voted") || "[]"))
      );
    } catch {
      /* ignore */
    }
  }, []);

  function vote(chain: string) {
    if (voted.has(chain)) return;
    track("vote_chain", { chain }); // 需求信号:哪条产业链呼声高,反哺开发优先级
    const next = new Set(voted);
    next.add(chain);
    setVoted(next);
    localStorage.setItem("stocktell_chain_voted", JSON.stringify(Array.from(next)));
    setCounts((c) => ({ ...c, [chain]: (c[chain] || 0) + 1 }));
    fetch("/api/chain-interest", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chain, voter: clientId() }),
    })
      .then((r) => r.json())
      .then((d) => {
        if (typeof d.count === "number")
          setCounts((c) => ({ ...c, [chain]: d.count }));
      })
      .catch(() => {});
  }

  const cur = open ? CHAINS.find((x) => x.key === open) : null;

  return (
    <div className="mb-4">
      <div className="flex flex-wrap items-center gap-2">
        {CHAINS.map((c) =>
          c.ready ? (
            <span
              key={c.key}
              className="rounded-full bg-gray-900 px-3 py-1 text-xs font-medium text-white"
            >
              {c.name}
            </span>
          ) : (
            <button
              key={c.key}
              onClick={() => setOpen(open === c.key ? null : c.key)}
              className={`rounded-full border px-3 py-1 text-xs transition-colors ${
                open === c.key
                  ? "border-amber-400 bg-amber-50 text-amber-700"
                  : "border-gray-200 bg-gray-50 text-gray-400 hover:border-amber-300 hover:text-amber-600"
              }`}
            >
              {c.name} · 开发中
              {counts[c.key] ? ` · ${counts[c.key]}人想看` : ""}
            </button>
          )
        )}
      </div>

      {cur && (
        <div className="mt-2 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-gray-700">
          🚧 <b>{cur.name}</b>正在搭建中。我们按呼声决定先做哪条——
          {voted.has(cur.key) ? (
            <span className="text-amber-700">
              已记下你想看 ✓,上线第一时间通知你。当前 {counts[cur.key] || 0} 人想要。
            </span>
          ) : (
            <button
              onClick={() => vote(cur.key)}
              className="ml-1 rounded-full bg-amber-500 px-3 py-1 text-xs font-medium text-white hover:bg-amber-600"
            >
              👀 我想要{counts[cur.key] ? `(${counts[cur.key]})` : ""}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
