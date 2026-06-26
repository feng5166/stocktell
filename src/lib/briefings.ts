// 今日简报数据层:有 Supabase 用 Supabase,否则回退到本地 JSON 文件。
// 切到生产只需在 .env.local 配好 Supabase,无需改业务代码。
import { promises as fs } from "fs";
import path from "path";
import { randomUUID } from "crypto";
import { getSupabase } from "@/lib/supabase";

export type Impact = "高" | "中" | "低";
export type BriefingStatus = "draft" | "published";

export interface Beneficiary {
  code: string;
  name: string;
}

export interface BriefingItem {
  id: string;
  date: string; // YYYY-MM-DD
  impact: Impact;
  title: string;
  triggerCode: string | null;
  triggerName: string | null;
  beneficiaries: Beneficiary[];
  retailTake: string;
  sourceUrl: string | null;
  status: BriefingStatus;
  createdAt: string;
}

export type NewBriefingItem = Omit<BriefingItem, "id" | "createdAt" | "status"> & {
  status?: BriefingStatus;
};

const TABLE = "briefing_items";
const LOCAL_FILE = path.join(process.cwd(), ".briefings.local.json");

/* ---------- 本地 JSON 回退 ---------- */
async function localRead(): Promise<BriefingItem[]> {
  try {
    const raw = await fs.readFile(LOCAL_FILE, "utf8");
    return JSON.parse(raw) as BriefingItem[];
  } catch {
    return [];
  }
}
async function localWrite(items: BriefingItem[]) {
  await fs.writeFile(LOCAL_FILE, JSON.stringify(items, null, 2), "utf8");
}

/* ---------- Supabase <-> 业务对象映射 ---------- */
/* eslint-disable @typescript-eslint/no-explicit-any */
function fromRow(r: any): BriefingItem {
  return {
    id: r.id,
    date: r.date,
    impact: r.impact,
    title: r.title,
    triggerCode: r.trigger_code,
    triggerName: r.trigger_name,
    beneficiaries: r.beneficiaries ?? [],
    retailTake: r.retail_take,
    sourceUrl: r.source_url,
    status: r.status,
    createdAt: r.created_at,
  };
}
function toRow(i: Partial<BriefingItem>) {
  const row: Record<string, any> = {};
  if (i.date !== undefined) row.date = i.date;
  if (i.impact !== undefined) row.impact = i.impact;
  if (i.title !== undefined) row.title = i.title;
  if (i.triggerCode !== undefined) row.trigger_code = i.triggerCode;
  if (i.triggerName !== undefined) row.trigger_name = i.triggerName;
  if (i.beneficiaries !== undefined) row.beneficiaries = i.beneficiaries;
  if (i.retailTake !== undefined) row.retail_take = i.retailTake;
  if (i.sourceUrl !== undefined) row.source_url = i.sourceUrl;
  if (i.status !== undefined) row.status = i.status;
  return row;
}
/* eslint-enable @typescript-eslint/no-explicit-any */

const IMPACT_ORDER: Record<Impact, number> = { 高: 0, 中: 1, 低: 2 };

function sortItems(items: BriefingItem[]) {
  return items.sort(
    (a, b) =>
      IMPACT_ORDER[a.impact] - IMPACT_ORDER[b.impact] ||
      a.createdAt.localeCompare(b.createdAt)
  );
}

/* ---------- 公共 API ---------- */
export async function listBriefing(opts: {
  date?: string;
  status?: BriefingStatus;
}): Promise<BriefingItem[]> {
  const sb = getSupabase();
  if (sb) {
    let q = sb.from(TABLE).select("*");
    if (opts.date) q = q.eq("date", opts.date);
    if (opts.status) q = q.eq("status", opts.status);
    const { data, error } = await q;
    if (error) throw new Error(error.message);
    return sortItems((data ?? []).map(fromRow));
  }
  let items = await localRead();
  if (opts.date) items = items.filter((i) => i.date === opts.date);
  if (opts.status) items = items.filter((i) => i.status === opts.status);
  return sortItems(items);
}

export async function insertDrafts(
  drafts: NewBriefingItem[]
): Promise<BriefingItem[]> {
  if (drafts.length === 0) return [];
  const sb = getSupabase();
  if (sb) {
    const rows = drafts.map((d) => toRow({ status: "draft", ...d }));
    const { data, error } = await sb.from(TABLE).insert(rows).select("*");
    if (error) throw new Error(error.message);
    return (data ?? []).map(fromRow);
  }
  const items = await localRead();
  const now = new Date().toISOString();
  const created = drafts.map((d) => ({
    id: randomUUID(),
    createdAt: now,
    status: "draft" as BriefingStatus,
    ...d,
  }));
  await localWrite([...items, ...created]);
  return created;
}

export async function updateBriefing(
  id: string,
  patch: Partial<BriefingItem>
): Promise<void> {
  const sb = getSupabase();
  if (sb) {
    const { error } = await sb.from(TABLE).update(toRow(patch)).eq("id", id);
    if (error) throw new Error(error.message);
    return;
  }
  const items = await localRead();
  const next = items.map((i) => (i.id === id ? { ...i, ...patch } : i));
  await localWrite(next);
}

export async function deleteBriefing(id: string): Promise<void> {
  const sb = getSupabase();
  if (sb) {
    const { error } = await sb.from(TABLE).delete().eq("id", id);
    if (error) throw new Error(error.message);
    return;
  }
  const items = await localRead();
  await localWrite(items.filter((i) => i.id !== id));
}

// 是否已接 Supabase(给后台/首页显示状态用)
export function storageBackend(): "supabase" | "local" {
  return getSupabase() ? "supabase" : "local";
}
