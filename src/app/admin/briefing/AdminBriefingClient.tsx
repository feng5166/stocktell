"use client";

import { useCallback, useEffect, useState } from "react";
import { IMPACT_META } from "@/lib/impact";

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

export default function AdminBriefingClient() {
  const [items, setItems] = useState<Item[]>([]);
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState("");
  const [previewDate, setPreviewDate] = useState("");
  const [preview, setPreview] = useState<Item[] | null>(null);

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
          d.usMarketClosed
            ? "美股休市,无隔夜映射,今日不生成"
            : d.engine === "llm"
            ? `生成 ${d.count} 条草稿(引擎:AI模型)`
            : `生成 ${d.count} 条草稿 ⚠️ 引擎:模板兜底(未配 LLM_API_KEY,内容偏套话,线上别裸跑)`
        );
        await load();
      } else {
        setMsg(`失败:${d.error}`);
      }
    } finally {
      setLoading(false);
    }
  }

  // 指定日期预览(不落库):用来演示/回测节后"假期累计"口径
  async function previewByDate() {
    if (!previewDate) {
      setMsg("先选个日期");
      return;
    }
    setLoading(true);
    setMsg(`生成 ${previewDate} 预览(不落库)…`);
    try {
      const r = await fetch(
        `/api/briefing/generate?date=${previewDate}&dryRun=1`,
        { method: "POST" }
      );
      const d = await r.json();
      if (d.ok) {
        setPreview(d.items || []);
        setMsg(
          `${previewDate} 预览:${d.count} 条${
            d.usMarketClosed ? "(美股休市)" : ""
          } · 引擎 ${d.engine} · 仅预览未入库`
        );
      } else {
        setMsg(`预览失败:${d.error}`);
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
    <div className="text-[#1a1d24]">
      <div className="mx-auto max-w-4xl px-4 py-6 sm:px-6">
        <div className="mb-4 flex flex-wrap items-center gap-3">
          <button
            onClick={generate}
            disabled={loading}
            className="rounded-md bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-700 disabled:opacity-50"
          >
            {loading ? "生成中…" : "⚡ 生成今日草稿"}
          </button>
          <span className="text-gray-300">|</span>
          <input
            type="date"
            value={previewDate}
            onChange={(e) => setPreviewDate(e.target.value)}
            className="rounded-md border border-gray-300 px-2 py-1.5 text-sm"
          />
          <button
            onClick={previewByDate}
            disabled={loading}
            className="rounded-md border border-gray-300 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100 disabled:opacity-50"
            title="指定日期生成预览(不入库),用于看节后『假期累计』效果"
          >
            🔎 指定日期预览
          </button>
          {msg && <span className="text-xs text-gray-500">{msg}</span>}
        </div>

        {preview && (
          <Section title={`指定日期预览 · ${previewDate}(不入库 ${preview.length} 条)`}>
            {preview.length === 0 && <Empty text="该日无异动 / 美股休市" />}
            {preview.map((it, i) => (
              <div
                key={i}
                className="mb-2 rounded-lg border border-dashed border-blue-300 bg-blue-50/40 px-4 py-3"
              >
                <div className="flex items-center gap-2">
                  <span
                    className={`h-2 w-2 shrink-0 rounded-full ${IMPACT_META[it.impact].dotClass}`}
                  />
                  <span className="text-sm font-medium">{it.title}</span>
                </div>
                <p className="mt-1 text-xs leading-relaxed text-gray-600">
                  {it.retailTake}
                </p>
              </div>
            ))}
            <button
              onClick={() => setPreview(null)}
              className="mt-1 text-xs text-gray-400 hover:text-gray-700"
            >
              收起预览
            </button>
          </Section>
        )}

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
                className={`h-2 w-2 shrink-0 rounded-full ${IMPACT_META[it.impact].dotClass}`}
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
      </div>
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
