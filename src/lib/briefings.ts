// 今日简报数据层:配了 Vercel Postgres(Prisma)就走 Postgres,否则回退到本地 JSON 文件。
// 切到生产只需配好 POSTGRES_PRISMA_URL,无需改业务代码。
import { promises as fs } from "fs";
import path from "path";
import { randomUUID } from "crypto";
import { Prisma } from "@prisma/client";
import { getPrisma } from "@/lib/prisma";

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
  triggerChange: number | null;
  beneficiaries: Beneficiary[];
  retailTake: string;
  sourceUrl: string | null;
  status: BriefingStatus;
  createdAt: string;
}

export type NewBriefingItem = Omit<BriefingItem, "id" | "createdAt" | "status"> & {
  status?: BriefingStatus;
};

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

/* ---------- Prisma 行 -> 业务对象 ---------- */
/* eslint-disable @typescript-eslint/no-explicit-any */
function fromRow(r: any): BriefingItem {
  return {
    id: r.id,
    date: r.date,
    impact: r.impact,
    title: r.title,
    triggerCode: r.triggerCode ?? null,
    triggerName: r.triggerName ?? null,
    triggerChange: r.triggerChange ?? null,
    beneficiaries: (r.beneficiaries ?? []) as Beneficiary[],
    retailTake: r.retailTake,
    sourceUrl: r.sourceUrl ?? null,
    status: r.status,
    createdAt:
      r.createdAt instanceof Date ? r.createdAt.toISOString() : r.createdAt,
  };
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
  const db = getPrisma();
  if (db) {
    const rows = await db.briefingItem.findMany({
      where: { date: opts.date, status: opts.status },
    });
    return sortItems(rows.map(fromRow));
  }
  let items = await localRead();
  if (opts.date) items = items.filter((i) => i.date === opts.date);
  if (opts.status) items = items.filter((i) => i.status === opts.status);
  return sortItems(items);
}

// 最近一期已发布简报(今天还没生成时,用于回退展示历史,而不是给用户一片空白)。
// 返回该期日期 + 条目;库里一条都没有时 date=null。
export async function latestBriefing(): Promise<{
  date: string | null;
  items: BriefingItem[];
}> {
  const db = getPrisma();
  if (db) {
    const newest = await db.briefingItem.findFirst({
      where: { status: "published" },
      orderBy: { date: "desc" },
      select: { date: true },
    });
    if (!newest) return { date: null, items: [] };
    const rows = await db.briefingItem.findMany({
      where: { date: newest.date, status: "published" },
    });
    return { date: newest.date, items: sortItems(rows.map(fromRow)) };
  }
  const all = (await localRead()).filter((i) => i.status === "published");
  if (all.length === 0) return { date: null, items: [] };
  const date = all.reduce((m, i) => (i.date > m ? i.date : m), all[0].date);
  return { date, items: sortItems(all.filter((i) => i.date === date)) };
}

export async function insertDrafts(
  drafts: NewBriefingItem[]
): Promise<BriefingItem[]> {
  if (drafts.length === 0) return [];
  const db = getPrisma();
  if (db) {
    const rows = await db.briefingItem.createManyAndReturn({
      data: drafts.map((d) => ({
        date: d.date,
        impact: d.impact,
        title: d.title,
        triggerCode: d.triggerCode,
        triggerName: d.triggerName,
        triggerChange: d.triggerChange,
        beneficiaries: d.beneficiaries as unknown as Prisma.InputJsonValue,
        retailTake: d.retailTake,
        sourceUrl: d.sourceUrl,
        status: d.status ?? "draft",
      })),
    });
    return rows.map(fromRow);
  }
  const items = await localRead();
  const now = new Date().toISOString();
  const created: BriefingItem[] = drafts.map((d) => ({
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
  const db = getPrisma();
  if (db) {
    await db.briefingItem.update({
      where: { id },
      data: {
        impact: patch.impact,
        title: patch.title,
        triggerCode: patch.triggerCode,
        triggerName: patch.triggerName,
        triggerChange: patch.triggerChange,
        beneficiaries: patch.beneficiaries as unknown as Prisma.InputJsonValue,
        retailTake: patch.retailTake,
        sourceUrl: patch.sourceUrl,
        status: patch.status,
      },
    });
    return;
  }
  const items = await localRead();
  const next = items.map((i) => (i.id === id ? { ...i, ...patch } : i));
  await localWrite(next);
}

export async function deleteBriefing(id: string): Promise<void> {
  const db = getPrisma();
  if (db) {
    await db.briefingItem.delete({ where: { id } });
    return;
  }
  const items = await localRead();
  await localWrite(items.filter((i) => i.id !== id));
}

// 是否已接数据库(给后台/首页显示状态用)
export function storageBackend(): "postgres" | "local" {
  return getPrisma() ? "postgres" : "local";
}
