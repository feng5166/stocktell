"use client";
// Pro 意向 v2 表单(PRD prd-trust-chat-pro-intent §6,PR5)。
// 只验证能力需求:最多选 2 项 + 一个主要使用场景 + 可选补充(≤100 字)。
// 纪律:不问价格、不出现「立即订阅」、不建 plan;页面继续明示全部免费、只收需求。
// 提交走 /api/feedback 结构化路径(category=pro_intent_v2,服务端白名单校验)。
// localStorage 只做展示抑制(恢复"已记录"态),不作真实去重——登录用户按最新一条统计(后台口径)。
// 埋点:pro_intent_view {entry} / pro_intent_submit {choice_1, choice_2, use_case, entry};
// 自由文本 other 只落 DB,严禁进 Umami(PRD §7)。
import { useEffect, useMemo, useState } from "react";
import { track } from "@/lib/analytics";
import { postJson } from "@/lib/post-json";
import {
  PRO_INTENT_CHOICES,
  PRO_USE_CASES,
  PRO_INTENT_CATEGORY,
  PRO_INTENT_MAX_CHOICES,
  PRO_INTENT_OTHER_MAX,
  type ProIntentChoice,
  type ProUseCase,
} from "@/lib/pro-intent";

const LS_KEY = "stocktell_pro_intent_v2_at";

export default function ProIntentForm() {
  const [choices, setChoices] = useState<ProIntentChoice[]>([]);
  const [useCase, setUseCase] = useState<ProUseCase | null>(null);
  const [other, setOther] = useState("");
  const [state, setState] = useState<"idle" | "busy" | "ok" | "fail">("idle");
  const [err, setErr] = useState("");
  const entry = useMemo(
    () =>
      typeof window !== "undefined"
        ? new URLSearchParams(window.location.search).get("from") ?? "direct"
        : "direct",
    []
  );

  useEffect(() => {
    track("pro_intent_view", { entry, trigger: "page" });
    try {
      if (localStorage.getItem(LS_KEY)) setState("ok"); // 展示抑制:同浏览器恢复已记录态
    } catch {
      /* 隐私模式忽略 */
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const toggle = (c: ProIntentChoice) =>
    setChoices((cur) =>
      cur.includes(c)
        ? cur.filter((x) => x !== c)
        : cur.length >= PRO_INTENT_MAX_CHOICES
          ? cur
          : [...cur, c]
    );

  async function submit() {
    if (choices.length < 1 || !useCase || state === "busy") return;
    setState("busy");
    setErr("");
    try {
      const { res: r, data: d } = await postJson("/api/feedback", {
        category: PRO_INTENT_CATEGORY,
        intent: { choices, useCase, other: choices.includes("other") ? other : "" },
        path: "/pro",
      });
      if (r.ok && d.ok !== false) {
        try {
          localStorage.setItem(LS_KEY, String(Date.now()));
        } catch {
          /* ignore */
        }
        setState("ok");
        track("pro_intent_submit", {
          choice_1: choices[0] ?? "",
          choice_2: choices[1] ?? "",
          use_case: useCase,
          entry,
        });
      } else {
        setErr(d.error ? String(d.error) : `HTTP ${r.status}`);
        setState("fail");
      }
    } catch {
      setState("fail");
    }
  }

  if (state === "ok")
    return (
      <div className="rounded-lg bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
        已记录,谢谢!这只是需求登记——不收费、不绑卡、不承诺时间;有进展会在站内公告。
      </div>
    );

  return (
    <div className="space-y-3">
      <div>
        <p className="text-xs font-medium text-gray-700">
          你最想要哪种进阶能力?(最多选 {PRO_INTENT_MAX_CHOICES} 项)
        </p>
        <div className="mt-1.5 flex flex-wrap gap-1.5">
          {(Object.entries(PRO_INTENT_CHOICES) as [ProIntentChoice, string][]).map(([k, label]) => {
            const on = choices.includes(k);
            return (
              <button
                key={k}
                type="button"
                onClick={() => toggle(k)}
                className={`rounded-lg border px-2.5 py-1.5 text-xs transition-colors ${
                  on
                    ? "border-brand-400 bg-brand-50 text-brand-700"
                    : "border-gray-200 bg-white text-gray-600 hover:border-gray-300"
                }`}
              >
                {on ? "✓ " : ""}
                {label}
              </button>
            );
          })}
        </div>
        {choices.includes("other") && (
          <input
            value={other}
            maxLength={PRO_INTENT_OTHER_MAX}
            onChange={(e) => setOther(e.target.value)}
            placeholder={`想要什么?(≤${PRO_INTENT_OTHER_MAX} 字)`}
            className="mt-1.5 w-full rounded-lg border border-gray-200 px-2.5 py-1.5 text-xs focus:border-brand-400 focus:outline-none"
          />
        )}
      </div>
      <div>
        <p className="text-xs font-medium text-gray-700">你主要在什么场景用 StockTell?(选一个)</p>
        <div className="mt-1.5 flex flex-wrap gap-1.5">
          {(Object.entries(PRO_USE_CASES) as [ProUseCase, string][]).map(([k, label]) => (
            <button
              key={k}
              type="button"
              onClick={() => setUseCase(k)}
              className={`rounded-lg border px-2.5 py-1.5 text-xs transition-colors ${
                useCase === k
                  ? "border-brand-400 bg-brand-50 text-brand-700"
                  : "border-gray-200 bg-white text-gray-600 hover:border-gray-300"
              }`}
            >
              {useCase === k ? "✓ " : ""}
              {label}
            </button>
          ))}
        </div>
      </div>
      <div className="flex items-center gap-3">
        <button
          onClick={submit}
          disabled={state === "busy" || choices.length < 1 || !useCase}
          className="rounded-lg bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-700 disabled:opacity-40"
        >
          {state === "busy" ? "提交中…" : "登记需求(免费,不绑卡)"}
        </button>
        {state === "fail" && <span className="text-xs text-rose-500">提交失败({err || "稍后再试"})</span>}
      </div>
    </div>
  );
}
