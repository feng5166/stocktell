"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

type Impact = "高" | "中" | "低";
interface Beneficiary {
  code: string;
  name: string;
}
interface Item {
  id: string;
  date: string;
  impact: Impact;
  title: string;
  triggerName: string | null;
  beneficiaries: Beneficiary[];
  retailTake: string;
  status: "draft" | "published";
  createdAt: string;
}

const IMPACT_DOT: Record<Impact, string> = {
  高: "bg-rose-500",
  中: "bg-amber-500",
  低: "bg-emerald-500",
};

export default function AdminBriefing() {
  const [items, setItems] = useState<Item[]>([]);
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState("");

  const load = useCallback(async () => {
    const r = await fetch("/api/briefing", { cache: "no-store" });
    const d = await r.json();
    if (d.ok) setItems(d.items);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function generate() {
    setLoading(true);
    setMsg("正在拉行情 + 生成草稿…");
    try {
      const r = await fetch("/api/briefing/generate", { method: "POST" });
      const d = await r.json();
      if (d.ok) {
        setMsg(
          `生成 ${d.count} 条草稿(引擎:${d.engine === "llm" ? "AI模型" : "模板"})`
        );
        await load();
      } else {
        setMsg(`失败:${d.error}`);
      }
    } finally {
      setLoading(false);
    }
  }

  async function patch(id: string, body: Partial<Item>) {
    await fetch(`/api/briefing/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    await load();
  }

  async function remove(id: string) {
    await fetch(`/api/briefing/${id}`, { method: "DELETE" });
    await load();
  }

  const drafts = items.filter((i) => i.status === "draft");
  const published = items.filter((i) => i.status === "published");

  return (
    <div className="min-h-screen bg-[#f7f8fa] text-[#1a1d24]">
      <header className="border-b border-gray-200 bg-white">
        <div className="mx-auto flex max-w-4xl items-center justify-between px-4 py-3 sm:px-6">
          <div className="flex items-center gap-2">
            <Link href="/" className="text-lg font-bold tracking-tight">
              StockTell
            </Link>
            <span className="text-xs text-gray-400">后台 · 简报审发</span>
          </div>
          <Link href="/" className="text-sm text-gray-500 hover:text-gray-900">
            看前台 →
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-4xl px-4 py-6 sm:px-6">
        <div className="mb-4 flex items-center gap-3">
          <button
            onClick={generate}
            disabled={loading}
            className="rounded-md bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-700 disabled:opacity-50"
          >
            {loading ? "生成中…" : "⚡ 生成今日草稿"}
          </button>
          {msg && <span className="text-xs text-gray-500">{msg}</span>}
        </div>

        <Section title={`草稿(${drafts.length})`}>
          {drafts.length === 0 && (
            <Empty text="暂无草稿,点上面「生成今日草稿」" />
          )}
          {drafts.map((it) => (
            <EditableCard
              key={it.id}
              item={it}
              onSave={(b) => patch(it.id, b)}
              onPublish={() => patch(it.id, { status: "published" })}
              onDelete={() => remove(it.id)}
            />
          ))}
        </Section>

        <Section title={`已发布(${published.length})`}>
          {published.length === 0 && <Empty text="还没有发布的简报" />}
          {published.map((it) => (
            <div
              key={it.id}
              className="mb-2 flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-4 py-3"
            >
              <span
                className={`h-2 w-2 shrink-0 rounded-full ${IMPACT_DOT[it.impact]}`}
              />
              <span className="text-sm font-medium">{it.title}</span>
              <span className="text-xs text-gray-400">{it.date}</span>
              <button
                onClick={() => patch(it.id, { status: "draft" })}
                className="ml-auto text-xs text-gray-500 hover:text-gray-900"
              >
                撤回
              </button>
              <button
                onClick={() => remove(it.id)}
                className="text-xs text-rose-500 hover:text-rose-700"
              >
                删除
              </button>
            </div>
          ))}
        </Section>
      </main>
    </div>
  );
}

function EditableCard({
  item,
  onSave,
  onPublish,
  onDelete,
}: {
  item: Item;
  onSave: (b: Partial<Item>) => void;
  onPublish: () => void;
  onDelete: () => void;
}) {
  const [impact, setImpact] = useState<Impact>(item.impact);
  const [title, setTitle] = useState(item.title);
  const [retailTake, setRetailTake] = useState(item.retailTake);
  const dirty =
    impact !== item.impact ||
    title !== item.title ||
    retailTake !== item.retailTake;

  return (
    <div className="mb-3 rounded-xl border border-gray-200 bg-white p-4">
      <div className="mb-2 flex items-center gap-2">
        <select
          value={impact}
          onChange={(e) => setImpact(e.target.value as Impact)}
          className="rounded border border-gray-300 px-2 py-1 text-sm"
        >
          <option value="高">🔴 高影响</option>
          <option value="中">🟡 中影响</option>
          <option value="低">🟢 低影响</option>
        </select>
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          className="flex-1 rounded border border-gray-300 px-2 py-1 text-sm"
        />
      </div>
      {item.beneficiaries.length > 0 && (
        <div className="mb-2 text-xs text-gray-500">
          受益 A 股:{item.beneficiaries.map((b) => b.name).join(" / ")}
        </div>
      )}
      <textarea
        value={retailTake}
        onChange={(e) => setRetailTake(e.target.value)}
        rows={3}
        className="w-full rounded border border-gray-300 px-2 py-1.5 text-sm"
      />
      <div className="mt-2 flex items-center gap-2">
        <button
          disabled={!dirty}
          onClick={() => onSave({ impact, title, retailTake })}
          className="rounded bg-gray-100 px-3 py-1 text-xs hover:bg-gray-200 disabled:opacity-40"
        >
          保存修改
        </button>
        <button
          onClick={onPublish}
          className="rounded bg-emerald-600 px-3 py-1 text-xs font-medium text-white hover:bg-emerald-700"
        >
          发布
        </button>
        <button
          onClick={onDelete}
          className="ml-auto text-xs text-rose-500 hover:text-rose-700"
        >
          删除
        </button>
      </div>
    </div>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="mb-6">
      <h2 className="mb-2 text-sm font-medium text-gray-700">{title}</h2>
      {children}
    </section>
  );
}

function Empty({ text }: { text: string }) {
  return (
    <div className="rounded-lg border border-dashed border-gray-300 bg-white px-4 py-8 text-center text-sm text-gray-400">
      {text}
    </div>
  );
}
