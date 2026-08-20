import type { Metadata } from "next";
import Link from "next/link";
import { SiteHeader } from "@/components/SiteHeader";
import { DISCLAIMER } from "@/lib/constants";
import ProIntentForm from "./ProIntentForm";

// 专业版占位页(2.2-C,2026-07-07 拍板:不上付费墙,只收意向信号)。
// 措辞纪律:①"规划中/候选",不承诺上线时间与内容 ②当前不收费,点击只是登记意向
// ③合规姿态(PRODUCT-CORE §7):订阅收费上线前需法律意见——本页存在本身不触发该项。
export const metadata: Metadata = {
  title: "StockTell 专业版(规划中):产业链研究的进阶能力 | StockTell",
  description:
    "StockTell 正在规划专业版:自选产业链状态、每日推送、关系验证复盘、更多产业链覆盖。当前全部功能免费,本页仅收集意向。不构成投资建议。",
  alternates: { canonical: "/pro" },
};

const TIERS: Array<{ name: string; note: string; items: string[]; tone: string }> = [
  {
    name: "免费(现在的一切)",
    note: "已经上线,并将保持免费",
    tone: "border-gray-200",
    items: [
      "今日产业链推理(每交易日简报)",
      "三条核心链因果链页 + 链级每日推理",
      "全部股票页:产业链定位 / 关系档 / 验证点",
      "自选产业链状态(今日触发)",
      "推理复盘(关系验证)与每日归档",
    ],
  },
  {
    name: "专业版(候选,规划中)",
    note: "以下是候选方向,收集反馈后决定,不代表承诺",
    tone: "border-brand-300",
    items: [
      "自选股产业链状态的深度追踪与提醒",
      "每日产业链推理邮件 / 推送",
      "关系验证复盘的更长历史与按链细分",
      "更多产业链覆盖(半导体设备链已在验证收录)",
      "个股验证点的持续跟踪清单",
    ],
  },
  {
    name: "企业 / 团队(远期候选)",
    note: "仅方向性探索",
    tone: "border-gray-200",
    items: ["API / 数据订阅", "自定义股票池与产业链监控", "研究团队共享自选与审阅工作台", "报告导出"],
  },
];

export default function ProPage() {
  return (
    <div className="site-atmosphere min-h-screen text-ink">
      <SiteHeader />
      <main className="mx-auto max-w-3xl px-4 py-6 sm:px-6">
        <header className="mb-5">
          <h1 className="text-h1 font-semibold tracking-tight">专业版 · 规划中</h1>
          <p className="mt-1.5 text-sm leading-relaxed text-gray-500">
            StockTell 目前<b className="text-gray-700">全部功能免费</b>。我们在规划哪些进阶能力值得做成专业版,
            这一页只做一件事:<b className="text-gray-700">收集你的意向</b>——不收费、不绑卡、不承诺时间表。
          </p>
        </header>

        <div className="mb-6 space-y-3">
          {TIERS.map((t) => (
            <section key={t.name} className={`rounded-2xl border bg-white p-4 shadow-sm ${t.tone}`}>
              <div className="flex items-baseline gap-2">
                <h2 className="text-sm font-semibold text-gray-800">{t.name}</h2>
                <span className="text-xs text-gray-400">{t.note}</span>
              </div>
              <ul className="mt-2 space-y-1">
                {t.items.map((it) => (
                  <li key={it} className="text-xs leading-relaxed text-gray-600">
                    · {it}
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>

        {/* PR5(意向 v2):从「两个按钮只证明点过」升级为结构化能力选择——回答用户究竟想为
            什么能力付费;不问价格、无「立即订阅」、不建 plan(PRD §6)。 */}
        <section className="mb-6 rounded-2xl bg-white p-4 shadow-sm">
          <h2 className="text-sm font-semibold text-gray-800">告诉我们你要什么</h2>
          <p className="mb-3 mt-1 text-xs leading-relaxed text-gray-500">
            当前全部功能免费,本次只收集需求——不收费、不绑卡、不承诺时间。现在就想收每日推理?
            <Link href="/stocks" className="text-brand-600 hover:underline">
              加自选
            </Link>
            并登录后即可收到盘前邮件早报(免费)。
          </p>
          <ProIntentForm />
        </section>

        <p className="text-center text-xs leading-relaxed text-gray-400">{DISCLAIMER}</p>
      </main>
    </div>
  );
}
