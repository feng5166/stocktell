import { requireAdmin } from "@/lib/admin";
import { todayISO } from "@/lib/date";
import { getBriefStatus, BRIEF_STATUS_UI, BRIEF_TONE_CHIP_CLS } from "@/lib/brief-status";
import AdminBriefingClient from "./AdminBriefingClient";

export const dynamic = "force-dynamic";

// 状态 chip 色调(2.1-A):与首页横幅同一套语义——failed 才红,fallback/blocked 琥珀,休市中性
export default async function AdminBriefingPage() {
  await requireAdmin(); // 非管理员 → 404
  const date = todayISO();
  const brief = await getBriefStatus(date).catch(() => null);
  const ui = brief ? BRIEF_STATUS_UI[brief.status] : null;
  return (
    <div>
      <div className="mx-auto max-w-4xl px-4 pt-4 sm:px-6">
        {ui ? (
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <span className="text-gray-400">今日简报状态 · {date}</span>
            <span className={`rounded px-2 py-0.5 font-medium ${BRIEF_TONE_CHIP_CLS[ui.tone]}`}>
              {ui.badge}
            </span>
            <span className="text-gray-500">{brief?.message ?? ui.note}</span>
          </div>
        ) : (
          <div className="text-xs text-gray-400">
            今日简报状态 · {date} · 尚无状态记录(07:00 生成 cron 跑过后写入)
          </div>
        )}
      </div>
      <AdminBriefingClient />
    </div>
  );
}
