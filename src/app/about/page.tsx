import { SiteHeader } from "@/components/SiteHeader";
import { FeedbackLink } from "@/components/FeedbackLink";

export const metadata = {
  title: "关于我们 · StockTell",
  description:
    "StockTell 是一个面向产业链投资理解的 AI 推理工具:解释全球事件如何传导到产业链、产业环节和相关公司。不荐股、不提供买卖建议,不构成投资建议。",
};

const CHAIN_FORMULA = "全球事件 → 产业链传导 → 环节变化 → 股票映射 → 关系类型 → 验证点";

const EXPLAIN_POINTS = [
  "这件事为什么重要;",
  "它可能传导到哪条产业链;",
  "影响的是哪个环节;",
  "哪些公司是直接映射;",
  "哪些只是间接或情绪映射;",
  "后续应该通过订单、客户、收入占比、毛利率、商业化收入等公开信息验证什么。",
];

const AUDIENCE = [
  "希望理解 AI、半导体、电力、机器人等主题背后产业链逻辑的个人投资者;",
  "不满足于“概念股列表”,希望区分真实传导和情绪映射的用户;",
  "需要快速建立事件到标的结构化理解的轻量投研用户;",
  "希望跟踪自选股在产业链中位置变化的长期观察者。",
];

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mt-9">
      <h2 className="text-h2 font-semibold tracking-tight text-gray-900">{title}</h2>
      <div className="mt-3 space-y-3 text-body text-gray-700">
        {children}
      </div>
    </section>
  );
}

export default function AboutPage() {
  return (
    <div className="min-h-screen bg-canvas text-ink">
      <SiteHeader active="关于我们" />

      <main className="mx-auto max-w-3xl px-4 py-10 sm:px-6">
        <div className="flex items-center gap-2.5">
          <h1 className="text-h1 font-semibold tracking-tight">关于 StockTell</h1>
          <FeedbackLink />
        </div>

        <div className="mt-6 space-y-3 text-body text-gray-700">
          <p>StockTell 是一个面向产业链投资理解的 AI 推理工具。</p>
          <p>
            我们不做股票推荐,也不提供买卖建议。StockTell
            关注的是:一个全球事件发生后,它会如何传导到产业链、产业环节和相关公司,以及这些关系是直接映射、间接映射、情绪映射,还是仍需要验证。
          </p>
          <p>
            在传统股票信息里,用户经常看到的是“某某概念股”“某某板块异动”“某某公司受益”。但这些说法往往混在一起,难以区分真实产业链关系和市场情绪联想。StockTell
            希望把这件事拆清楚。
          </p>
          <p>我们的核心框架是:</p>
          <p className="rounded-xl bg-gray-50 px-4 py-3 font-mono text-sm text-gray-800">
            {CHAIN_FORMULA}
          </p>
          <p>也就是说,StockTell 不是简单告诉你“哪些股票相关”,而是进一步解释:</p>
          <ul className="list-disc space-y-1.5 pl-5">
            {EXPLAIN_POINTS.map((t) => (
              <li key={t}>{t}</li>
            ))}
          </ul>
          <p>
            目前 StockTell 重点覆盖 AI 推理基础设施、AI 数据中心电力基础设施、AI
            应用等方向,并持续扩展到半导体设备、HBM / 存储、机器人等产业链。
          </p>
          <p>
            我们相信,投资判断的第一步不是预测涨跌,而是先看清关系。
            <br />
            StockTell 希望帮助用户从新闻和行情噪音中,建立更结构化的产业链理解。
          </p>
        </div>

        <Section title="我们不做什么">
          <p>
            StockTell 不是荐股工具。
            <br />
            我们不提供买入、卖出、追涨、低吸、抄底等交易建议。
          </p>
          <p>
            StockTell 也不是新闻聚合站。
            <br />
            我们不会简单堆叠资讯,而是尝试把事件放回产业链结构里解释。
          </p>
          <p>
            StockTell 更不是“AI 炒股大师”。
            <br />
            AI 在这里的作用,是辅助整理信息、识别关系、生成验证框架,而不是替用户做投资决策。
          </p>
        </Section>

        <Section title="我们做什么">
          <p>StockTell 做的是产业链关系解释。</p>
          <p>我们希望回答三个问题:</p>
          <p>
            第一,这件事为什么会传导?
            <br />
            例如,海外 AI 基础设施事件,为什么会影响服务器、光模块、液冷、电力设备等环节。
          </p>
          <p>
            第二,传导到了哪里?
            <br />
            是 AI 推理基础设施链、数据中心电力链,还是 AI 应用侧商业化逻辑。
          </p>
          <p>
            第三,这个关系是否需要验证?
            <br />
            直接映射也不等于确定受益。真正需要看的,是订单、客户、收入占比、毛利率、产品商业化等公开证据。
          </p>
        </Section>

        <Section title="适合谁使用">
          <p>StockTell 适合有一定产业链投资意识的用户,包括:</p>
          <ul className="list-disc space-y-1.5 pl-5">
            {AUDIENCE.map((t) => (
              <li key={t}>{t}</li>
            ))}
          </ul>
        </Section>

        <Section title="重要说明">
          <p>
            StockTell 提供的是产业链关系分析和信息整理,不构成任何投资建议。
            <br />
            页面中的关系类型、历史统计和验证点,仅用于帮助用户理解产业链结构和后续应核验的信息,不代表未来价格表现,也不代表收益承诺。
          </p>
          <p className="border-t border-gray-100 pt-4 text-meta text-gray-400">
            投资有风险,决策需独立判断。
          </p>
        </Section>
      </main>
    </div>
  );
}
