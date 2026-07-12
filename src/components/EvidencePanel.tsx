"use client";
// 统一证据卡面板(PRD prd-trust-chat-pro-intent §3.3 · PR1)。
// 三套 references(静态/每日/长期关系)经 lib/evidence.ts adapter 归一后都用这一块渲染:
// 折叠入口(「依据 N 条」)→ 展开证据卡(名称/类型/日期/支撑/角色/核实状态)。
// 空态 = 「推理假设 · 待验证」chip:没有引用时必须可见,不能用空白掩盖(PRD §3.4)。
// 埋点(docs/埋点需求.md):reference_open / reference_external_click——只传标识与枚举,
// 不传正文与 PII。client 组件只吃序列化后的 EvidenceItem[],不把数据源拖进客户端包。
import { track } from "@/lib/analytics";
import type { EvidenceItem, EvidenceVerify, EvidenceRole } from "@/lib/evidence";

const VERIFY_CHIP: Record<EvidenceVerify, { label: string; cls: string }> = {
  verified: { label: "已核实可达", cls: "bg-emerald-50 text-emerald-700" },
  standing: { label: "常设核实入口", cls: "bg-gray-100 text-gray-500" },
  unreachable: { label: "当前不可达", cls: "bg-rose-50 text-rose-600" },
  pending: { label: "待验证", cls: "bg-amber-50 text-amber-700" },
};
const ROLE_CHIP: Record<EvidenceRole, { label: string; cls: string }> = {
  fact: { label: "事实来源", cls: "bg-sky-50 text-sky-700" },
  reasoning: { label: "StockTell 推理", cls: "bg-brand-50 text-brand-700" },
  hypothesis: { label: "推理假设", cls: "bg-rose-50 text-rose-600" },
};

// 空态:无引用的判断如实标注,别让用户以为"有依据只是没展示"。
export function HypothesisChip({ text = "推理假设 · 待验证" }: { text?: string }) {
  return (
    <span className="inline-block rounded bg-rose-50/80 px-1.5 py-0.5 text-[11px] text-rose-600">
      {text}
    </span>
  );
}

export function EvidencePanel({
  insightId,
  date,
  targetType,
  targetId,
  items,
  label,
  emptyText,
}: {
  insightId: string;
  date?: string;
  targetType: "judgment" | "risk" | "hop" | "heat" | "mapping" | "other";
  targetId: string;
  items: EvidenceItem[];
  label?: string; // 折叠入口文案,默认「依据 N 条」
  emptyText?: string; // 空态文案,默认「推理假设 · 待验证」
}) {
  if (items.length === 0) return <HypothesisChip text={emptyText} />;
  const kinds = new Set(items.map((it) => it.kind));
  const referenceKind = kinds.size > 1 ? "mixed" : (items[0].kind as string);
  return (
    <details
      className="mt-1"
      onToggle={(e) => {
        if ((e.currentTarget as HTMLDetailsElement).open) {
          track("reference_open", {
            insight_id: insightId,
            ...(date ? { date } : {}),
            target_type: targetType,
            target_id: targetId,
            reference_kind: referenceKind,
          });
          // PR5 轻入口信号:完成一次证据展开(ProIntentNudge 监听;无监听者=无副作用)
          window.dispatchEvent(new CustomEvent("stocktell:deep-engaged", { detail: { trigger: "evidence" } }));
        }
      }}
    >
      <summary className="cursor-pointer text-[11px] text-brand-600/90">
        📎 {label ?? `依据 ${items.length} 条`}
      </summary>
      <ul className="mt-1.5 space-y-2 rounded-lg bg-white/70 px-2.5 py-2 ring-1 ring-gray-100">
        {items.map((it) => {
          const v = VERIFY_CHIP[it.verify];
          const role = ROLE_CHIP[it.role];
          // 「可访问时提供外链」:已知不可达只留名称与状态,不递一个死链(历史证据不删除)
          const linkable = it.url && it.verify !== "unreachable";
          return (
            <li key={it.id} className="text-xs leading-relaxed">
              {linkable ? (
                <a
                  href={it.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-medium text-brand-600 hover:underline"
                  onClick={() =>
                    track("reference_external_click", {
                      insight_id: insightId,
                      reference_id: it.id,
                      source_type: it.sourceType ?? it.kind,
                    })
                  }
                >
                  {it.name} ↗
                </a>
              ) : (
                <span className="font-medium text-gray-600">{it.name}</span>
              )}
              {it.date && <span className="ml-1 text-[11px] text-gray-400">{it.date}</span>}
              <span className="ml-1 inline-flex flex-wrap gap-1 align-middle">
                {it.sourceType && (
                  <span className="rounded bg-gray-100 px-1 py-0.5 text-[11px] text-gray-500">
                    {it.sourceType}
                  </span>
                )}
                <span className={`rounded px-1 py-0.5 text-[11px] ${v.cls}`}>{v.label}</span>
                <span className={`rounded px-1 py-0.5 text-[11px] ${role.cls}`}>{role.label}</span>
              </span>
              {it.supports && (
                <span className="block text-[11px] text-gray-500">支撑:{it.supports}</span>
              )}
            </li>
          );
        })}
        <li className="border-t border-gray-100 pt-1.5 text-[11px] leading-relaxed text-gray-400">
          「已核实可达」只代表该材料真实存在、链接实测可达,不代表 StockTell 的推论必然成立;
          「常设核实入口」是去哪核实的长期入口,不等于已证明具体结论。
          <a href="/methodology?from=evidence" className="ml-1 text-brand-500 hover:underline">
            这些标签是什么意思?
          </a>
        </li>
      </ul>
    </details>
  );
}
